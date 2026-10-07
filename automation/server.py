"""Optional isolated browser/virtual-display service. Never mount host display or directories."""
import base64, hmac, io, ipaddress, json, os, socket, subprocess
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlsplit
TOKEN=os.environ.get('NOVA_AUTOMATION_TOKEN','')
DOMAINS=set(d.strip() for d in os.environ.get('NOVA_BROWSER_DOMAINS','').lower().split(',') if d.strip())
def public_url(value):
    u=urlsplit(value)
    if u.scheme!='https' or u.hostname not in DOMAINS or u.username or u.password or u.port not in (None,443):
        raise ValueError('Domain is not allowlisted')
    addresses=socket.getaddrinfo(u.hostname,443,type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
        raise ValueError('Private network is forbidden')
    return value

def browser_task(data):
    from playwright.sync_api import sync_playwright
    public_url(data['url'])
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,chromium_sandbox=True)
        context=browser.new_context(service_workers='block',accept_downloads=False)
        def route(r):
            try:
                public_url(r.request.url)
                if r.request.method not in ('GET','HEAD'):
                    raise ValueError('Browser writes/submissions are disabled in reference adapter')
                r.continue_()
            except Exception:
                r.abort()
        context.route('**/*',route)
        context.route_web_socket('**/*',lambda ws:ws.close())
        page=context.new_page();page.set_default_timeout(10000)
        page.goto(data['url'],wait_until='domcontentloaded',timeout=20000)
        results=[]
        for a in data['actions']:
            t=a['type']
            if t=='extract':results.append({'text':page.locator('body').inner_text()[:30000],'url':page.url})
            elif t=='screenshot':results.append({'mime':'image/png','base64':base64.b64encode(page.screenshot()).decode()})
            elif t=='click':page.locator(a['selector']).click();results.append({'clicked':a['selector']})
            elif t=='type':page.locator(a['selector']).fill(a['text']);results.append({'typed':True})
            elif t=='scroll':page.mouse.wheel(0,a['pixels']);results.append({'scrolled':a['pixels']})
            else:raise ValueError('Unsupported action')
        context.close();browser.close()
        return {'results':results,'isolation':'separate-container-browser'}

def desktop_task(data):
    if os.environ.get('NOVA_VIRTUAL_DESKTOP')!='1':raise ValueError('Virtual desktop disabled')
    # DISPLAY points only to container Xvfb. Never pass a host X socket or DISPLAY.
    results=[]
    for a in data['actions']:
        t=a['type']
        if t=='screenshot':
            subprocess.run(['scrot','/tmp/nova-screen.png'],check=True,timeout=10)
            with open('/tmp/nova-screen.png','rb') as f:results.append({'mime':'image/png','base64':base64.b64encode(f.read()).decode()})
        elif t=='click':subprocess.run(['xdotool','mousemove',str(int(a['x'])),str(int(a['y'])),'click','1'],check=True,timeout=10);results.append({'clicked':True})
        elif t=='type':subprocess.run(['xdotool','type','--clearmodifiers','--',a['text']],check=True,timeout=10);results.append({'typed':True})
        elif t=='key':subprocess.run(['xdotool','key','--clearmodifiers',a['key']],check=True,timeout=10);results.append({'key':a['key']})
        else:raise ValueError('Unsupported action')
    return {'results':results,'isolation':'container-xvfb'}

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def do_POST(self):
        code=200
        try:
            if not TOKEN or not hmac.compare_digest(self.headers.get('Authorization',''),'Bearer '+TOKEN):raise ValueError('Authorization required')
            size=int(self.headers.get('Content-Length','0'))
            if size<1 or size>100000:raise ValueError('Invalid request size')
            data=json.loads(self.rfile.read(size));actions=data.get('actions')
            if not isinstance(actions,list) or not 1<=len(actions)<=8:raise ValueError('Invalid action count')
            for a in actions:
                if not isinstance(a,dict) or a.get('type') not in ('extract','screenshot','click','type','scroll','key'):raise ValueError('Invalid action')
                if a['type']=='type' and (not isinstance(a.get('text'),str) or len(a['text'])>8000):raise ValueError('Invalid text')
                if a['type']=='key' and (not isinstance(a.get('key'),str) or not __import__('re').fullmatch(r'[a-zA-Z0-9+_-]{1,40}',a['key'])):raise ValueError('Invalid key')
                if data.get('kind')=='desktop' and a['type']=='click' and not all(isinstance(a.get(k),(int,float)) and 0<=a[k]<=4096 for k in ('x','y')):raise ValueError('Invalid coordinates')
            result=browser_task(data) if data.get('kind')=='browser' else desktop_task(data) if data.get('kind')=='desktop' else {'error':'Unknown adapter'}
        except Exception as e:code=400;result={'error':str(e)}
        body=json.dumps(result).encode()
        if len(body)>1500000:code=400;body=b'{"error":"Automation response too large"}'
        self.send_response(code);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
if __name__=='__main__':
    if len(TOKEN)<24:raise RuntimeError('Set NOVA_AUTOMATION_TOKEN with at least 24 characters')
    HTTPServer(('0.0.0.0',4320),Handler).serve_forever()

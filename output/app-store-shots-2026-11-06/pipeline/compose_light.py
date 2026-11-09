import sys,random
from PIL import Image,ImageDraw,ImageFont,ImageFilter,ImageChops
S=sys.argv[1]; O=S+'/out/'; W,H=1320,2868
FG=(14,14,16);LIME=(226,84,34);EMBER=(255,107,61);VIOLET=(92,74,226);MUTED=(104,101,95)
BASE=(249,247,243)
def font(sz,wt):
    f=ImageFont.truetype('/System/Library/Fonts/SFNS.ttf',sz)
    try:
        ax=f.get_variation_axes(); v=[]
        for a in ax:
            n=a['name'].decode() if isinstance(a['name'],bytes) else a['name']
            if 'eight' in n: v.append(wt)
            elif 'ptical' in n: v.append(a['maximum'])
            else: v.append(a['default'])
        f.set_variation_by_axes(v)
    except Exception as e: print('font',e)
    return f
def bg(blobs,orbit=None):
    lay=Image.new('RGB',(W//4,H//4),BASE);d=ImageDraw.Draw(lay)
    for (x,y,r,c) in blobs:
        d.ellipse([(x-r)/4,(y-r)/4,(x+r)/4,(y+r)/4],fill=c)
    lay=lay.filter(ImageFilter.GaussianBlur(95)).resize((W,H),Image.BICUBIC)
    n=Image.effect_noise((W,H),6).convert('RGB')
    im=Image.blend(lay,ImageChops.overlay(lay,n),.10).convert('RGBA')
    if orbit:
        x,y,rx,ry,ang=orbit
        L=Image.new('RGBA',(W*2,W*2),(0,0,0,0));e=ImageDraw.Draw(L);cx=cy=W
        e.ellipse([cx-rx*2,cy-ry*2,cx+rx*2,cy+ry*2],outline=(14,14,16,46),width=4)
        e.ellipse([cx+rx*2-22,cy-22,cx+rx*2+22,cy+22],fill=EMBER+(255,))
        L=L.rotate(ang,Image.BICUBIC).resize((W,W),Image.LANCZOS)
        im.paste(L,(int(x-W/2),int(y-W/2)),L)
    return im
def shadow(im,p,x,y,dx=0,dy=46,blur=60,op=.26):
    A=p.getchannel('A').point(lambda v:int(v*op))
    c=Image.new('L',(W,H),0);c.paste(A,(x+dx,y+dy));c=c.filter(ImageFilter.GaussianBlur(blur))
    im.paste(Image.new('RGBA',(W,H),(40,30,24,255)),(0,0),c)
def text(im,lines,sub,y=170,size=136,x=84):
    d=ImageDraw.Draw(im);f=font(size,560)
    for t,c,arrow in lines:
        tx=x
        for ch in t:   # tight display tracking
            d.text((tx,y),ch,font=f,fill=c); tx+=d.textlength(ch,font=f)-size*.022
        if arrow:
            a=size*.5;px=tx+size*.2;py=y+size*.42;w=int(size*.085)
            d.line([px,py,px+a,py+a],fill=c,width=w);d.line([px+a,py+a*.12,px+a,py+a+w/2],fill=c,width=w);d.line([px+a*.12,py+a,px+a+w/2,py+a],fill=c,width=w)
        y+=int(size*1.1)
    if sub:
        y+=26;d.text((x+4,y),sub,font=font(52,430),fill=MUTED);y+=70
    return y
def put(im,f,scale,x,y,crop=True):
    p=Image.open(O+f).convert('RGBA')
    if crop:p=p.crop(p.getbbox())
    p=p.resize((int(p.width*scale),int(p.height*scale)),Image.LANCZOS);shadow(im,p,x,y);im.paste(p,(x,y),p)
    return p.size
def flat(im,f):
    # upright phone, whole device in view, one scale factor for both axes
    p=Image.open(O+f).convert('RGBA');p=p.crop(p.getbbox());a=p.width/p.height
    k=2060/p.height;p=p.resize((round(p.width*k),round(p.height*k)),Image.LANCZOS)
    print(f,'aspect src %.4f out %.4f'%(a,p.width/p.height))
    x=(W-p.width)//2;shadow(im,p,x,740);im.paste(p,(x,740),p)
def save(im,n):
    im.convert('RGB').save(f'{O}L{n}.png');print(n)
# 1 hero
im=bg([(1050,2700,800,(241,244,214)),(1250,500,500,(252,236,226))],(1130,760,170,80,24))
text(im,[('Read your stars,',FG,0),('not your Sun sign',LIME,1)],'Your real birth chart, read with you.')
put(im,'p1L.png',.80,70,2868-int(2724*.80));save(im,'01-hero')
# 2 reading
im=bg([(1250,500,620,(253,236,226)),(60,2300,700,(236,234,250))])
text(im,[('Ask it anything',FG,0),('in plain words',LIME,1)],'Every answer comes from your own chart.')
put(im,'p2.png',.86,int((W-1423*.86)/2)+4,770,True);save(im,'02-ask')
# 3 kundli
im=bg([(80,800,620,(236,234,250)),(1250,2500,720,(253,236,226))])
text(im,[('Your kundli,',FG,0),('computed exactly',LIME,1)],'Positions from the Swiss Ephemeris.')
flat(im,'f3.png');save(im,'03-kundli')
# 4 life
im=bg([(660,2700,860,(234,231,251)),(1300,900,420,(240,238,251))])
text(im,[('Your whole life,',FG,0),('in periods',VIOLET,1)],'Every dasha, with what it means for you.')
flat(im,'f4.png');save(im,'04-life')
# 5 today
im=bg([(1250,400,600,(253,238,228)),(80,2400,700,(241,244,216))])
text(im,[('The full detail,',FG,0),('then the gist',LIME,1)],'What it means for you, in simple words.')
flat(im,'f5.png');save(im,'05-simple')
fs=['01-hero','02-ask','03-kundli','04-life','05-simple']
sh=Image.new('RGB',(5*400+60,880),(120,120,124))
for i,n in enumerate(fs):
    t=Image.open(f'{O}L{n}.png');t.thumbnail((400,870));sh.paste(t,(10+i*410,5))
sh.save(O+'draft_light.jpg',quality=90)

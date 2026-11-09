import sys,random
from PIL import Image,ImageDraw,ImageFont,ImageFilter,ImageChops
S=sys.argv[1]; O=S+'/out/'; W,H=1320,2868
FG=(244,241,234);LIME=(223,238,107);EMBER=(255,107,61);VIOLET=(124,108,255);MUTED=(190,187,179)
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
    im=Image.new('RGB',(W//4,H//4),(10,10,11));d=ImageDraw.Draw(im)
    lay=Image.new('RGB',im.size,(0,0,0));d=ImageDraw.Draw(lay)
    for (x,y,r,c) in blobs:
        d.ellipse([(x-r)/4,(y-r)/4,(x+r)/4,(y+r)/4],fill=c)
    lay=lay.filter(ImageFilter.GaussianBlur(70))
    im=ImageChops.add(im,lay).resize((W,H),Image.BICUBIC)
    n=Image.effect_noise((W,H),9).convert('RGB')
    im=Image.blend(im,ImageChops.overlay(im,n),.35).convert('RGBA')
    if orbit:
        x,y,rx,ry,ang=orbit
        L=Image.new('RGBA',(W*2,W*2),(0,0,0,0));e=ImageDraw.Draw(L)
        cx=cy=W
        e.ellipse([cx-rx*2,cy-ry*2,cx+rx*2,cy+ry*2],outline=(244,241,234,70),width=4)
        e.ellipse([cx+rx*2-22,cy-22,cx+rx*2+22,cy+22],fill=EMBER+(255,))
        L=L.rotate(ang,Image.BICUBIC).resize((W,W),Image.LANCZOS)
        im.alpha_composite(L,(0,0)) if False else im.paste(L,(int(x-W/2),int(y-W/2)),L)
    return im
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
    p=p.resize((int(p.width*scale),int(p.height*scale)),Image.LANCZOS);im.alpha_composite(p,(x,y)) if x>=0 and y>=0 and x+p.width<=W and y+p.height<=H else im.paste(p,(x,y),p)
    return p.size
def save(im,n):
    im.convert('RGB').save(f'{O}{n}.png');print(n)
# 1 hero
im=bg([(1000,2800,760,(150,166,40)),(300,2900,500,(90,110,20)),(1250,900,420,(60,30,18))],(1130,760,170,80,24))
text(im,[('Read your stars,',FG,0),('not your Sun sign',LIME,1)],'Your real birth chart, read with you.')
put(im,'p1.png',.80,70,2868-int(2724*.80));save(im,'01-hero')
# 2 reading
im=bg([(1200,700,600,(110,38,16)),(100,1900,700,(44,30,120)),(1200,2800,500,(90,30,14))])
text(im,[('Ask it anything',FG,0),('in plain words',LIME,1)],'Every answer comes from your own chart.')
put(im,'p2.png',.86,int((W-1423*.86)/2)+4,770,True);save(im,'02-ask')
# 3 kundli
im=bg([(200,1000,640,(52,40,140)),(1250,2300,700,(120,44,18)),(600,2900,500,(30,24,90))])
text(im,[('Your kundli,',FG,0),('computed exactly',LIME,1)],'Positions from the Swiss Ephemeris.')
put(im,'p3.png',.80,-100,770);save(im,'03-kundli')
# 4 life
im=bg([(660,2750,820,(64,52,190)),(1250,1500,460,(40,30,120)),(80,600,380,(70,28,14))])
text(im,[('Your whole life,',FG,0),('in periods',VIOLET,1)],'Every dasha, with what it means for you.')
s=.76;p=Image.open(O+'p4.png').convert('RGBA');b=p.getbbox();print('p4',b)
p=p.crop(b);p=p.resize((int(p.width*s),int(p.height*s)),Image.LANCZOS)
im.paste(p,(int(W/2-(2250-b[0])*s),H-p.height),p);save(im,'04-life')
# 5 today
im=bg([(1250,300,560,(100,36,16)),(80,2200,640,(30,70,50)),(1200,2750,520,(60,70,20))])
text(im,[('A new reading',FG,0),('morning and night',LIME,1)],'Written from today\'s sky and your chart.')
put(im,'p5.png',.86,int((W-1423*.86)/2)+4,770);save(im,'05-today')
fs=['01-hero','02-ask','03-kundli','04-life','05-today']
sh=Image.new('RGB',(5*400+60,880),(245,245,247))
for i,n in enumerate(fs):
    t=Image.open(f'{O}{n}.png');t.thumbnail((400,870));sh.paste(t,(10+i*410,5))
sh.save(O+'draft.jpg',quality=90)

$.evalFile(new File("/private/tmp/claude-501/-Users-shivvyas/de3fe9f8-580e-45ce-9d23-ccb50fdff3bd/scratchpad/lib.jsx"));
var P=(new File("/private/tmp/claude-501/-Users-shivvyas/de3fe9f8-580e-45ce-9d23-ccb50fdff3bd/scratchpad/screens.txt")); P.open("r"); var SRC=P.readln(); P.close();
var O="/private/tmp/claude-501/-Users-shivvyas/de3fe9f8-580e-45ce-9d23-ccb50fdff3bd/scratchpad/out/";
function hand(psd,so,screen,out,cols){var doc=app.open(new File("/private/tmp/claude-501/-Users-shivvyas/de3fe9f8-580e-45ce-9d23-ccb50fdff3bd/scratchpad/psd/"+psd+".psd"));
 for(var k in cols)setFill(doc,k,cols[k]);
 swapScreen(doc,findLayer(doc,so),SRC+screen);findLayer(doc,"background").visible=false;savePNG(doc,O+out);doc.close(SaveOptions.DONOTSAVECHANGES);}
function ip(psd,screen,out,w,h){var doc=app.open(new File("/private/tmp/claude-501/-Users-shivvyas/de3fe9f8-580e-45ce-9d23-ccb50fdff3bd/scratchpad/psd/"+psd+".psd"));
 swapScreen(doc,findLayer(doc,"Edit"),SRC+screen);findLayer(doc,"Environment").visible=false;
 doc.resizeImage(UnitValue(w,"px"),UnitValue(h,"px"),72,ResampleMethod.BICUBICSMOOTHER);savePNG(doc,O+out);doc.close(SaveOptions.DONOTSAVECHANGES);}
hand("hand07","your design here (double-click to edit)","07-ask-home.png","p1.png",{"bounce light":[150,166,40],"highlight phone":[244,250,196],"highlight hand":[223,238,107]});
ip("ip08","03-ask.png","p2.png",1423,3138);
ip("ip06","04-kundli.png","p3.png",8000,6000);
hand("hand02","your design here","05-life.png","p4.png",{"bounce light":[70,58,190],"highlight phone body":[200,194,255],"highlight hand":[124,108,255]});
ip("ip08","02-today.png","p5.png",1423,3138);
"ok";

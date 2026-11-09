$.evalFile(new File("/private/tmp/claude-501/-Users-shivvyas/de3fe9f8-580e-45ce-9d23-ccb50fdff3bd/scratchpad/lib.jsx"));
var SRC="/Users/shivvyas/Projects/Web/astra/output/app-store-shots-2026-10-26/",O="/private/tmp/claude-501/-Users-shivvyas/de3fe9f8-580e-45ce-9d23-ccb50fdff3bd/scratchpad/out/";
var doc=app.open(new File("/private/tmp/claude-501/-Users-shivvyas/de3fe9f8-580e-45ce-9d23-ccb50fdff3bd/scratchpad/psd/hand07.psd"));
var c={"bounce light":[214,206,196],"highlight phone":[255,255,255],"highlight hand":[255,226,204]};for(var k in c)setFill(doc,k,c[k]);
findLayer(doc,"luts").visible=false;
swapScreen(doc,findLayer(doc,"your design here (double-click to edit)"),SRC+"07-ask-home.png");findLayer(doc,"background").visible=false;savePNG(doc,O+"p1L.png");doc.close(SaveOptions.DONOTSAVECHANGES);
doc=app.open(new File("/private/tmp/claude-501/-Users-shivvyas/de3fe9f8-580e-45ce-9d23-ccb50fdff3bd/scratchpad/psd/ip05.psd"));
swapScreen(doc,findLayer(doc,"Edit"),SRC+"05-life.png");findLayer(doc,"Environment").visible=false;
doc.resizeImage(UnitValue(8000,"px"),UnitValue(6000,"px"),72,ResampleMethod.BICUBICSMOOTHER);savePNG(doc,O+"p4L.png");doc.close(SaveOptions.DONOTSAVECHANGES);"ok";

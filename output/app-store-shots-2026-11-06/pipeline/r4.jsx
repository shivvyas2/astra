$.evalFile(new File("/private/tmp/claude-501/-Users-shivvyas/de3fe9f8-580e-45ce-9d23-ccb50fdff3bd/scratchpad/lib.jsx"));
var SRC="/Users/shivvyas/Projects/Web/astra/output/app-store-shots-2026-10-26/",O="/private/tmp/claude-501/-Users-shivvyas/de3fe9f8-580e-45ce-9d23-ccb50fdff3bd/scratchpad/out/";
function ip(screen,out){var doc=app.open(new File("/private/tmp/claude-501/-Users-shivvyas/de3fe9f8-580e-45ce-9d23-ccb50fdff3bd/scratchpad/psd/ip08.psd"));
 swapScreen(doc,findLayer(doc,"Edit"),SRC+screen);findLayer(doc,"Environment").visible=false;
 doc.resizeImage(UnitValue(1423,"px"),UnitValue(3138,"px"),72,ResampleMethod.BICUBICSMOOTHER);savePNG(doc,O+out);doc.close(SaveOptions.DONOTSAVECHANGES);}
ip("04-kundli.png","f3.png");ip("05-life.png","f4.png");ip("03-ask.png","f5.png");"ok";

app.displayDialogs = DialogModes.NO;
app.preferences.rulerUnits = Units.PIXELS;
function findLayer(s,name){for(var i=0;i<s.layers.length;i++){var l=s.layers[i];if(l.name==name)return l;if(l.typename=="LayerSet"){var r=findLayer(l,name);if(r)return r;}}return null;}
function placeInto(so,png){
  var d=new ActionDescriptor();d.putPath(charIDToTypeID("null"),new File(png));d.putBoolean(charIDToTypeID("Lnkd"),false);
  executeAction(charIDToTypeID("Plc "),d,DialogModes.NO);
  var l=so.activeLayer,b=l.bounds,w=b[2].as("px")-b[0].as("px"),h=b[3].as("px")-b[1].as("px");
  var W=so.width.as("px"),H=so.height.as("px");
  var sc=Math.max(W/w,H/h)*100; l.resize(sc,sc,AnchorPosition.MIDDLECENTER);
  b=l.bounds; l.translate(W/2-(b[0].as("px")+b[2].as("px"))/2,H/2-(b[1].as("px")+b[3].as("px"))/2);
}
function swapScreen(doc,layer,png){
  doc.activeLayer=layer;
  executeAction(stringIDToTypeID("placedLayerEditContents"),new ActionDescriptor(),DialogModes.NO);
  var so=app.activeDocument; var info=so.width.as("px")+"x"+so.height.as("px");
  placeInto(so,png); so.save(); so.close(SaveOptions.DONOTSAVECHANGES); app.activeDocument=doc; return info;
}
function savePNG(doc,path){var o=new PNGSaveOptions();o.compression=6;doc.saveAs(new File(path),o,true,Extension.LOWERCASE);}
function setFill(doc,name,c){var l=findLayer(doc,name);if(!l)return;doc.activeLayer=l;
 var d=new ActionDescriptor(),r=new ActionReference();r.putEnumerated(stringIDToTypeID("contentLayer"),charIDToTypeID("Ordn"),charIDToTypeID("Trgt"));d.putReference(charIDToTypeID("null"),r);
 var f=new ActionDescriptor(),k=new ActionDescriptor();k.putDouble(charIDToTypeID("Rd  "),c[0]);k.putDouble(charIDToTypeID("Grn "),c[1]);k.putDouble(charIDToTypeID("Bl  "),c[2]);
 f.putObject(charIDToTypeID("Clr "),charIDToTypeID("RGBC"),k);d.putObject(charIDToTypeID("T   "),stringIDToTypeID("solidColorLayer"),f);executeAction(charIDToTypeID("setd"),d,DialogModes.NO);}

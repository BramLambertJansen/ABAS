const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(process.argv[2] || process.cwd());
const ts = require(path.join(root,'node_modules/typescript'));
const output = path.resolve(process.argv[3] || '/tmp/abas-frontend-inventory.json');
const files = [];
function walk(dir) { for (const entry of fs.readdirSync(dir, {withFileTypes:true})) { const p = path.join(dir, entry.name); if(entry.isDirectory())walk(p); else if(/\.tsx?$/.test(p))files.push(p); } }
walk(path.join(root,'src'));
const refs = [], tags = [], classes = [], inlineStyles = [], rawColors = [], sizes = [];
const components = files.filter(f=>f.includes('/src/components/'));
for (const file of files) {
 const text = fs.readFileSync(file,'utf8');
 const sf = ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,file.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 const at = n=>({file:path.relative(root,file),line:sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1});
 sizes.push({file:path.relative(root,file),lines:text.split('\n').length});
 function visit(n) {
  if(ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
   const spec=n.moduleSpecifier.text;
   const resolved=spec.startsWith('@/')?path.join(root,'src',spec.slice(2)):spec.startsWith('.')?path.resolve(path.dirname(file),spec):null;
   if(resolved && resolved.startsWith(path.join(root,'src/components')+path.sep)) {
    const module='@/'+path.relative(path.join(root,'src'),resolved).replace(/\.tsx?$/,'').split(path.sep).join('/');
    refs.push({...at(n),module,source:spec,names:n.importClause?.namedBindings?.elements?.map(e=>e.name.text)??[]});
   }
  }
  if(ts.isJsxOpeningElement(n)||ts.isJsxSelfClosingElement(n)) {
   const tag=n.tagName.getText(sf);
   tags.push({...at(n),tag,props:n.attributes.properties.filter(ts.isJsxAttribute).map(a=>a.name.getText(sf))});
  }
  if(ts.isJsxAttribute(n) && n.name.getText(sf)==='style') inlineStyles.push({...at(n),text:n.getText(sf)});
  if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n)||ts.isTemplateHead(n)||ts.isTemplateMiddle(n)||ts.isTemplateTail(n)) {
   const value=n.text;
   if(/(?:^|\s)(?:[\w-]+:)*(?:bg|text|border|rounded|h|w|p|gap|shadow|ring)-/.test(value)) {
    const tokens=value.split(/\s+/).filter(Boolean);
    classes.push({...at(n),text:value,arbitrary:tokens.filter(t=>/\[/.test(t))});
   }
   if(/^#[0-9a-f]{3,8}$/i.test(value)||/^(?:rgba?|hsla?)\(/.test(value))rawColors.push({...at(n),value,context:n.parent.getText(sf).slice(0,220)});
  }
  ts.forEachChild(n,visit);
 }
 visit(sf);
}
const usage = components.map(f=>{
 const module='@/components/'+path.basename(f).replace(/\.tsx?$/,'');
 const consumers=refs.filter(r=>r.module===module);
 return {file:path.relative(root,f),consumers:consumers.length,featureFolders:[...new Set(consumers.filter(c=>c.file.startsWith('src/features/')).map(c=>c.file.split('/')[2]))],imports:consumers};
});
const nativeCounts={}; for(const t of tags) if(/^[a-z]/.test(t.tag)) nativeCounts[t.tag]=(nativeCounts[t.tag]||0)+1;
const arbitraryCounts={}; for(const c of classes)for(const a of c.arbitrary)arbitraryCounts[a]=(arbitraryCounts[a]||0)+1;
const data={sourceRoot:root,method:'TypeScript AST: static import sites and string/template fragments; counts are source occurrences, not rendered UI instances or defect counts.',files:files.length,tsxFiles:files.filter(f=>f.endsWith('.tsx')).length,usage,nativeCounts,classes,inlineStyles,rawColors,tags,arbitraryCounts,sizes:sizes.sort((a,b)=>b.lines-a.lines)};
fs.writeFileSync(output,JSON.stringify(data,null,2)+'\n');
console.log(JSON.stringify({files:data.files,tsxFiles:data.tsxFiles,sharedFiles:components.length,usage:usage.map(({file,consumers,featureFolders})=>({file,consumers,featureFolders})),nativeCounts,classLiterals:classes.length,withArbitrary:classes.filter(c=>c.arbitrary.length).length,arbitraryOccurrences:Object.values(arbitraryCounts).reduce((a,b)=>a+b,0),topArbitrary:Object.entries(arbitraryCounts).sort((a,b)=>b[1]-a[1]).slice(0,35),rawColors,inlineStyles,largestFiles:data.sizes.slice(0,15)},null,2));

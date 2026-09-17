import sharp from 'sharp';
import { readdir, stat, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
let before=0,after=0;
for(const name of await readdir(root+'public/tutorial')){
 if(!/\.(png|jpg)$/.test(name)||name==='blender-base-interface.png')continue;
 const limit=['dashboard.png','empty-template.png'].includes(name)?1440:1280;
 const source=root+'public/tutorial/'+name,target=source.replace(/\.(png|jpg)$/,'.webp');
 await sharp(source).resize({width:limit,height:limit,fit:'inside',withoutEnlargement:true}).webp({quality:82,effort:6}).toFile(target);
 before+=(await stat(source)).size;after+=(await stat(target)).size;
}
for(const name of ['factory-campus-preview','masthead-generated','v2-pump']){
 await sharp(root+`public/assets/${name}.png`).webp({quality:85,effort:6}).toFile(root+`public/assets/${name}.webp`);
}
await copyFile(root+'public/assets/masthead-generated.webp',root+'template/public/assets/masthead-generated.webp');
console.log({tutorialImageBytesBefore:before,tutorialImageBytesAfter:after});

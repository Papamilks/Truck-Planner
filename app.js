import * as pdfjsLib from './vendor/pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.mjs', import.meta.url).href;
const $ = s => document.querySelector(s);
const state = {items:[], specs:[
  {name:"53' Flatbed",length:636,width:102,height:102,upper_length:0,upper_height:0,max_weight:45000,single_piece_only:false,length_first:true},
  {name:"53' Stepdeck",length:522,width:102,height:122,upper_length:102,upper_height:102,max_weight:45000,single_piece_only:false,length_first:true},
  {name:"53' Lo-Pro Stepdeck",length:522,width:102,height:126,upper_length:102,upper_height:102,max_weight:45000,single_piece_only:false,length_first:true},
  {name:"Stretch Step",length:840,width:102,height:122,upper_length:102,upper_height:102,max_weight:45000,single_piece_only:true},
  {name:"RGN",length:360,width:102,height:138,upper_length:0,upper_height:0,max_weight:45000,single_piece_only:false},
  {name:"Stretch RGN",length:720,width:102,height:138,upper_length:0,upper_height:0,max_weight:45000,single_piece_only:true}
],plan:null,editingItem:null,editingTrailer:null};
const LEGAL_WIDTH=102,MAX_OVERWIDTH=174;
const LF={in:1,ft:12,mm:1/25.4,cm:1/2.54,m:39.37007874}, WF={lb:1,lbs:1,kg:2.2046226218};
const fmt=(v,d=2)=>Number(v).toLocaleString(undefined,{maximumFractionDigits:d});
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let exportObjectUrl=null;
function placementTooltip(q){
  const lines=[
    q.item.item_id+' · '+q.zone,
    'Length: '+fmt(q.item.length)+' in',
    'Width: '+fmt(q.item.width)+' in',
    'Height: '+fmt(q.item.height)+' in',
    'Weight: '+fmt(q.item.weight,0)+' lb'
  ];
  if(q.rotated)lines.push('Placed floor: '+fmt(q.length)+' × '+fmt(q.width)+' in (rotated 90°)');
  lines.push(q.width>LEGAL_WIDTH?'Overdimensional width · other cargo may follow behind, never beside':'Legal placed width');
  return lines.join('\n');
}
function alertMsg(message,error=false){const n=$('#notice');n.textContent=message;n.className='notice'+(error?' error':'');n.hidden=false;n.scrollIntoView({block:'nearest',behavior:'smooth'})}
function clearExport(){for(const link of [$('#exportLink'),$('#summaryExportLink')]){link.hidden=true;link.removeAttribute('href')}if(exportObjectUrl){URL.revokeObjectURL(exportObjectUrl);exportObjectUrl=null}}
function invalidate(){state.plan=null;$('#exportBtn').disabled=true;$('#summaryExportBtn').disabled=true;clearExport();render()}
function norm(i){const f=LF[i.length_unit],w=WF[i.weight_unit];if(!f||!w)throw Error('Unsupported units on '+i.item_id);return {...i,length:i.length*f,width:i.width*f,height:i.height*f,weight:i.weight*w,length_unit:'in',weight_unit:'lb'}}
function heavyReasons(i){const n=norm(i),r=[];if(n.width>MAX_OVERWIDTH)r.push('width '+fmt(n.width/12)+' ft > 14.50 ft');if(n.height>150)r.push('height '+fmt(n.height/12)+' ft > 12.50 ft');if(n.weight>55000)r.push('weight '+fmt(n.weight,0)+' lb > 55,000 lb');return r}
function singlePieceOnly(s){return !!s.single_piece_only||s.name==='Stretch Step'||s.name==='Stretch RGN'}
function lengthFirst(s){return !!s.length_first||["53' Flatbed","53' Stepdeck","53' Lo-Pro Stepdeck"].includes(s.name)}
function zones(s){
  return s.upper_length>0
    ? [{name:'Upper deck',start:0,length:s.upper_length,width:Math.min(s.width,LEGAL_WIDTH),height:s.upper_height},
       {name:'Lower deck',start:s.upper_length,length:s.length,width:Math.min(s.width,LEGAL_WIDTH),height:s.height}]
    : [{name:'Deck',start:0,length:s.length,width:Math.min(s.width,LEGAL_WIDTH),height:s.height}];
}
function orientations(i){
  const options=[[i.length,i.width,false]];
  if(i.rotatable&&i.length!==i.width)options.push([i.width,i.length,true]);
  return options;
}
function fits(i,s){
  const r=[];
  const zoneFits=zones(s).map(z=>({
    floor:orientations(i).some(([length,width])=>length<=z.length&&width<=MAX_OVERWIDTH),
    height:i.height<=z.height
  }));
  if(!zoneFits.some(z=>z.floor&&z.height)){
    if(!zoneFits.some(z=>z.floor))r.push('floor dimensions');
    if(!zoneFits.some(z=>z.height)||zoneFits.some(z=>z.floor&&!z.height))r.push('deck height');
  }
  if(i.weight>s.max_weight)r.push('weight');
  return r;
}
// The diagram's top and bottom are the two sides across deck width.
// Split a piece's weight by its footprint across the deck centerline.
// Overwidth pieces are treated as centered across the deck.
function lateralWeight(load,extra){
  const half=Math.min(load.spec.width,LEGAL_WIDTH)/2;
  let top=0,bottom=0;
  for(const p of extra?[...load.placements,extra]:load.placements){
    const weight=p.item.weight;
    if(p.width>half*2){top+=weight/2;bottom+=weight/2;continue}
    const topWidth=Math.max(0,Math.min(p.y+p.width,half)-Math.max(p.y,0));
    top+=weight*topWidth/p.width;
    bottom+=weight*(p.width-topWidth)/p.width;
  }
  return {top,bottom};
}
function position(load,i,upcoming=[]){
  if(singlePieceOnly(load.spec)&&load.placements.length)return null;
  const candidates=[];
  for(const zone of zones(load.spec)){
    if(i.height>zone.height)continue;
    const placedHere=load.placements.filter(p=>p.zone===zone.name);
    const xs=[...new Set([zone.start,...placedHere.map(p=>p.x+p.length)])]
      .filter(x=>x>=zone.start&&x<zone.start+zone.length).sort((a,b)=>a-b);
    const ysFor=width=>width>zone.width?[0]:
      [...new Set([0,...placedHere.map(p=>p.y+p.width),zone.width-width])]
        .filter(y=>y>=0&&y+width<=zone.width).sort((a,b)=>a-b);
    for(const [length,width,rotated] of orientations(i))for(const y of ysFor(width))for(const x of xs){
      const overwidth=width>zone.width;
      if(x+length>zone.start+zone.length||width>MAX_OVERWIDTH||(overwidth?y!==0:y+width>zone.width))continue;
      // Overwidth pieces block only their own longitudinal span, allowing
      // multiple overwidth pieces in sequence on the same deck.
      if(placedHere.some(p=>{
        const alongLength=!(x+length<=p.x||p.x+p.length<=x);
        return alongLength&&(overwidth||p.width>zone.width||!(y+width<=p.y||p.y+p.width<=y));
      }))continue;
      const placement={item:i,x,y,length,width,rotated,zone:zone.name};
      const balance=lateralWeight(load,placement);
      // Prefer a closer top/bottom weight split, then retain top-left flow.
      candidates.push({score:[x+y+100*Math.abs(balance.top-balance.bottom)/(load.weight+i.weight),y,x,length>=width?0:1],placement});
    }
  }
  const compare=(a,b)=>{for(let k=0;k<a.score.length;k++)if(a.score[k]!==b.score[k])return a.score[k]-b.score[k];return 0};
  candidates.sort(compare);
  if(!candidates.length)return null;
  if(!i.rotatable||!upcoming.length)return candidates[0].placement;
  // Compare orientations at the first available position without jumping
  // down a row to improve a lookahead score.
  let best=candidates[0],bestCount=-1;
  const trials=candidates.filter(c=>c.placement.x===best.placement.x&&c.placement.y===best.placement.y);
  for(const candidate of trials){
    const trial={spec:load.spec,weight:load.weight+i.weight,placements:[...load.placements,candidate.placement]};
    let count=0;
    for(const next of upcoming.slice(0,10)){
      if(fits(next,trial.spec).length||trial.weight+next.weight>trial.spec.max_weight)continue;
      const placed=position(trial,next);
      if(placed){trial.placements.push(placed);trial.weight+=next.weight;count++}
    }
    if(count>bestCount){bestCount=count;best=candidate}
  }
  return best.placement;
}
function rebalanceWidth(load){
  // After truck assignment, shift pieces only across the deck. Never change
  // their front-to-rear position or let a shift create a floor overlap.
  for(let pass=0;pass<2;pass++)for(const p of load.placements){
    const zone=zones(load.spec).find(z=>z.name===p.zone);
    if(!zone||p.width>zone.width)continue;
    const others=load.placements.filter(q=>q!==p);
    const candidates=[p.y,0,zone.width-p.width,(zone.width-p.width)/2,
      ...others.filter(q=>q.zone===p.zone).flatMap(q=>[q.y+q.width,q.y-p.width])];
    let bestY=p.y;
    let bestDiff=(()=>{const w=lateralWeight(load);return Math.abs(w.top-w.bottom)})();
    for(const y of candidates){
      if(y<0||y+p.width>zone.width)continue;
      if(others.some(q=>q.zone===p.zone&&!(p.x+p.length<=q.x||q.x+q.length<=p.x)&&
        (q.width>zone.width||!(y+p.width<=q.y||q.y+q.width<=y))))continue;
      const candidate={...p,y};
      const w=lateralWeight({spec:load.spec,placements:others},candidate);
      const diff=Math.abs(w.top-w.bottom);
      if(diff<bestDiff-0.001){bestDiff=diff;bestY=y}
    }
    p.y=bestY;
  }
}
function fillOpenStepdecks(loads,items,start){
  for(const load of loads.filter(l=>["53' Stepdeck","53' Lo-Pro Stepdeck"].includes(l.spec.name))){
    while(true){
      let best=null;
      for(let k=start;k<items.length;k++){
        const item=items[k];
        if(fits(item,load.spec).length||load.weight+item.weight>load.spec.max_weight)continue;
        const placement=position(load,item,items.slice(k+1));
        if(!placement)continue;
        if(!best||item.weight>best.item.weight||item.weight===best.item.weight&&item.length*item.width>best.item.length*best.item.width)
          best={k,item,placement};
      }
      if(!best)break;
      load.placements.push(best.placement);load.weight+=best.item.weight;
      items.splice(best.k,1);
    }
  }
}
function optimize(){if(!state.specs.length)throw Error('Add at least one trailer type.');const expanded=[],rejected=[],heavy=[];for(const raw of state.items){const i=norm(raw),hr=heavyReasons(raw);if(hr.length){heavy.push({item:i,reason:hr.join('; ')});continue}if(Math.min(i.length,i.width,i.height,i.weight)<=0||!Number.isInteger(i.quantity)||i.quantity<1){rejected.push({item:i,reason:'Dimensions, weight, and quantity must be positive'});continue}if(!state.specs.some(s=>!fits(i,s).length)){rejected.push({item:i,reason:'No compatible trailer — '+state.specs.map(s=>s.name+': '+fits(i,s).join(', ')).join('; ')});continue}for(let n=0;n<i.quantity;n++)expanded.push({...i,item_id:i.quantity>1?i.item_id+'-'+(n+1):i.item_id,quantity:1})}
// Secure cargo longer than the deck width first. For the remaining pieces,
// similar widths form compact rows as the planner travels left to right.
const deckWidth=state.specs.find(lengthFirst)?.width??state.specs[0].width;
const flatbed=state.specs.find(s=>s.name==="53' Flatbed");
const needsOtherEquipment=i=>flatbed&&fits(i,flatbed).length>0;
expanded.sort((a,b)=>{const constrained=Number(needsOtherEquipment(b))-Number(needsOtherEquipment(a));if(constrained)return constrained;if(needsOtherEquipment(a)){if(a.height!==b.height)return b.height-a.height;return b.length-a.length||b.length*b.width-a.length*a.width}const al=Math.max(a.length,a.width)>deckWidth,bl=Math.max(b.length,b.width)>deckWidth;return Number(bl)-Number(al)||(al?b.length*b.width-a.length*a.width:b.width-a.width||b.length-a.length)||b.weight-a.weight});const loads=[];let stepFillDone=false;for(let index=0;index<expanded.length;index++){
if(!stepFillDone&&flatbed&&!needsOtherEquipment(expanded[index])){
  // Search all remaining ordinary freight before any of it goes to flatbeds.
  fillOpenStepdecks(loads,expanded,index);stepFillDone=true;
  if(index>=expanded.length)break;
}
const i=expanded[index],upcoming=expanded.slice(index+1);let choices=[];for(const load of loads){if(singlePieceOnly(load.spec)||fits(i,load.spec).length||load.weight+i.weight>load.spec.max_weight)continue;const p=position(load,i,upcoming);if(p){const end=Math.max(0,...load.placements.map(q=>q.x+q.length));choices.push({load,p,end:Math.max(end,p.x+p.length),weight:load.weight+i.weight})}}
// Height-specific pieces were assigned first. Use ordinary freight to fill
// the remaining space on those stepdecks before selecting a flatbed.
const useFlatbed=flatbed&&!fits(i,flatbed).length;
if(useFlatbed){
  const stepChoices=choices.filter(c=>["53' Stepdeck","53' Lo-Pro Stepdeck"].includes(c.load.spec.name));
  const flatChoices=choices.filter(c=>c.load.spec===flatbed);
  choices=stepChoices.length?stepChoices:flatChoices;
}
choices.sort((a,b)=>{
  // When multiple overwidth pieces fit one deck, consolidate them before
  // considering less-used trucks. Positioning still enforces the deck limits.
  if(a.p.width>LEGAL_WIDTH&&b.p.width>LEGAL_WIDTH){
    const count=l=>l.placements.filter(q=>q.width>LEGAL_WIDTH).length;
    const grouped=count(b.load)-count(a.load);
    if(grouped)return grouped;
  }
  return !useFlatbed?a.load.spec.height-b.load.spec.height||b.weight/b.load.spec.max_weight-a.weight/a.load.spec.max_weight||a.end-b.end:
  a.load.spec!==flatbed?b.weight/b.load.spec.max_weight-a.weight/a.load.spec.max_weight||a.end-b.end:
  a.load.placements.reduce((v,q)=>v+q.length*q.width,0)-b.load.placements.reduce((v,q)=>v+q.length*q.width,0)||a.end-b.end;
});let load,p;if(choices.length){({load,p}=choices[0])}else{const spec=useFlatbed?flatbed:state.specs.find(s=>!fits(i,s).length&&(!singlePieceOnly(s)||!state.specs.some(other=>!singlePieceOnly(other)&&!fits(i,other).length)));load={number:loads.length+1,spec,placements:[],weight:0};p=position(load,i,upcoming);loads.push(load)}load.placements.push(p);load.weight+=i.weight}for(const load of loads)rebalanceWidth(load);return {loads,rejected,heavy}}
function showTab(name){document.querySelectorAll('.tab').forEach(b=>{const a=b.dataset.tab===name;b.classList.toggle('active',a);b.setAttribute('aria-selected',String(a))});document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===name))}
document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>showTab(b.dataset.tab)));
const summaryHeaders=['Truck','Trailer Type','Piece Count','Total Length (in)','Total Width (in)','Total Height (in)','Total Weight (lb)','Width Status'];
function summaryRows(p){return [summaryHeaders,...p.loads.map(l=>[l.number,l.spec.name,l.placements.length,Math.max(0,...l.placements.map(q=>q.x+q.length)),Math.max(0,...l.placements.map(q=>q.y+q.width)),Math.max(0,...l.placements.map(q=>q.item.height)),l.weight,l.placements.some(q=>q.width>LEGAL_WIDTH)?'Overdimensional width':'Legal width'])]}
const heavySummaryHeaders=['Item','Quantity','Length (in)','Width (in)','Height (in)','Weight (lb)','Heavy Haul Reason'];
function heavySummaryRows(p){return [heavySummaryHeaders,...p.heavy.map(x=>[x.item.item_id,x.item.quantity,x.item.length,x.item.width,x.item.height,x.item.weight,x.reason])]}
function renderSummary(p){
  const el=$('#summaryContent');
  if(!p){el.className='empty';el.textContent='Create a loading plan to preview the truck summary.';return}
  const rows=summaryRows(p),heavy=heavySummaryRows(p);
  const truckTable=p.loads.length?'<div class="tablewrap"><table class="summary-table"><thead><tr>'+rows[0].map(v=>'<th scope="col">'+esc(v)+'</th>').join('')+'</tr></thead><tbody>'+rows.slice(1).map(r=>'<tr>'+r.map((v,k)=>'<td>'+(typeof v==='number'&&k>=3&&k<=5?fmt(v)+' in ('+fmt(v/12)+' ft)':typeof v==='number'&&k===6?fmt(v,0):esc(v))+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>':'<div class="summary-empty">No packed trucks in this plan.</div>';
  const heavyTable=p.heavy.length?'<div class="tablewrap"><table class="summary-table"><thead><tr>'+heavy[0].map(v=>'<th scope="col">'+esc(v)+'</th>').join('')+'</tr></thead><tbody>'+heavy.slice(1).map(r=>'<tr>'+r.map((v,k)=>'<td>'+(typeof v==='number'&&k>=2&&k<=4?fmt(v)+' in ('+fmt(v/12)+' ft)':typeof v==='number'&&k===5?fmt(v,0):esc(v))+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>':'<div class="summary-empty">No heavy haul pieces in this plan.</div>';
  el.className='';el.innerHTML=truckTable+'<div class="summary-section-title"><h3>Heavy haul items ('+p.heavy.length+')</h3><p>Excluded from automatic packing; review separately.</p></div>'+heavyTable;
}
function render(){const h=state.items.reduce((a,i)=>a+(heavyReasons(i).length?1:0),0);$('#cargoCount').textContent=state.items.length;$('#trailerCount').textContent=state.specs.length;$('#loadCount').textContent=state.plan?.loads.length||0;$('#heavyCount').textContent=h;
$('#cargoRows').innerHTML=state.items.length?state.items.map((i,k)=>{
  if(state.editingItem===k)return '<tr class="editing" data-edit-row="item" data-index="'+k+'"><td><input data-field="item_id" aria-label="Item ID" value="'+esc(i.item_id)+'"></td><td><input data-field="quantity" aria-label="Quantity" type="number" min="1" step="1" value="'+i.quantity+'"></td>'+['length','width','height'].map(key=>'<td><input data-field="'+key+'" aria-label="'+key+'" type="number" min="0.001" step="any" value="'+i[key]+'"></td>').join('')+'<td><input data-field="weight" aria-label="Weight" type="number" min="0.001" step="any" value="'+i.weight+'"></td><td><label class="inline-check"><input data-field="rotatable" aria-label="Rotation allowed" type="checkbox" '+(i.rotatable?'checked':'')+'> Allowed</label></td><td><div class="unit-pair"><select data-field="length_unit" aria-label="Dimension unit">'+['in','ft','mm','cm','m'].map(u=>'<option value="'+u+'" '+(u===i.length_unit?'selected':'')+'>'+u+'</option>').join('')+'</select><select data-field="weight_unit" aria-label="Weight unit">'+['lb','kg'].map(u=>'<option value="'+u+'" '+(u===i.weight_unit?'selected':'')+'>'+u+'</option>').join('')+'</select></div></td><td><div class="rowactions"><button class="save" data-action="saveItem" data-index="'+k+'">Save</button><button data-action="cancelItem" data-index="'+k+'">Cancel</button></div><div class="row-error" role="alert"></div></td></tr>';
  const heavy=heavyReasons(i).length,overwidth=norm(i).width>LEGAL_WIDTH;
  return '<tr class="'+(heavy?'heavy':'')+'"><td>'+esc(i.item_id)+'</td><td>'+i.quantity+'</td><td>'+fmt(i.length)+' '+i.length_unit+'</td><td>'+fmt(i.width)+' '+i.length_unit+'</td><td>'+fmt(i.height)+' '+i.length_unit+'</td><td>'+fmt(i.weight)+' '+i.weight_unit+'</td><td>'+(i.rotatable?'Yes':'No')+'</td><td><span class="badge '+(heavy?'heavy':overwidth?'overwidth':'')+'">'+(heavy?'Heavy haul':overwidth?'Overdimensional width':'Planning')+'</span></td><td><div class="rowactions"><button data-action="editItem" data-index="'+k+'">Edit</button><button data-action="deleteItem" data-index="'+k+'">Remove</button></div></td></tr>';
}).join(''):'<tr><td colspan="9" class="empty">No cargo yet. Add a piece above or import a packing list.</td></tr>';
$('#trailerRows').innerHTML=state.specs.length?state.specs.map((s,k)=>{
  if(state.editingTrailer===k)return '<tr class="editing" data-edit-row="trailer" data-index="'+k+'"><td>'+(k+1)+'</td><td><input data-field="name" aria-label="Equipment" value="'+esc(s.name)+'"></td><td><input data-field="length" aria-label="Deck or lower length in inches" type="number" min="0.001" step="any" value="'+s.length+'"></td><td><input data-field="upper_length" aria-label="Upper length in inches" type="number" min="0" step="any" value="'+(s.upper_length||0)+'"></td><td><input data-field="width" aria-label="Width in inches" type="number" min="0.001" step="any" value="'+s.width+'"></td><td><div class="unit-pair"><input data-field="height" aria-label="Deck or lower height in inches" type="number" min="0.001" step="any" value="'+s.height+'"><input data-field="upper_height" aria-label="Upper height in inches" type="number" min="0" step="any" value="'+(s.upper_height||0)+'"></div></td><td><input data-field="max_weight" aria-label="Weight limit in pounds" type="number" min="0.001" step="any" value="'+s.max_weight+'"></td><td><label class="inline-check"><input data-field="single_piece_only" aria-label="One piece only" type="checkbox" '+(singlePieceOnly(s)?'checked disabled':'')+'> One piece</label></td><td><div class="rowactions"><button class="save" data-action="saveTrailer" data-index="'+k+'">Save</button><button data-action="cancelTrailer" data-index="'+k+'">Cancel</button></div><div class="row-error" role="alert"></div></td></tr>';
  return '<tr><td>'+(k+1)+'</td><td>'+esc(s.name)+'</td><td>'+fmt(s.length)+' in</td><td>'+(s.upper_length?fmt(s.upper_length)+' in':'—')+'</td><td>'+fmt(s.width)+' in</td><td>'+fmt(s.height)+(s.upper_length?' / '+fmt(s.upper_height):'')+' in</td><td>'+fmt(s.max_weight,0)+' lb</td><td>'+(singlePieceOnly(s)?'<span class="badge">One piece only</span>':'Standard')+'</td><td><div class="rowactions"><button data-action="up" data-index="'+k+'" aria-label="Move '+esc(s.name)+' up" '+(!k?'disabled':'')+'>↑</button><button data-action="down" data-index="'+k+'" aria-label="Move '+esc(s.name)+' down" '+(k===state.specs.length-1?'disabled':'')+'>↓</button><button data-action="editTrailer" data-index="'+k+'">Edit</button><button data-action="deleteTrailer" data-index="'+k+'">Remove</button></div></td></tr>';
}).join(''):'<tr><td colspan="9" class="empty">Add a trailer type to create a plan.</td></tr>';
const hh=state.items.map(i=>({item:i,reasons:heavyReasons(i)})).filter(x=>x.reasons.length);$('#heavyContent').className=hh.length?'heavylist':'empty';$('#heavyContent').innerHTML=hh.length?hh.map(x=>'<div class="heavyitem"><strong>'+esc(x.item.item_id)+' · Qty '+x.item.quantity+'</strong><span>'+esc(x.reasons.join('; '))+'</span></div>').join(''):'No heavy haul pieces to review.';
renderSummary(state.plan);
if(!state.plan){$('#planContent').className='empty';$('#planContent').textContent='Add cargo and select “Create loading plan” to see the truck layout.';return}
const p=state.plan;$('#planContent').className='';
let html='<div class="summary"><div class="stat">Trucks<strong>'+p.loads.length+'</strong></div><div class="stat">Planned pieces<strong>'+p.loads.reduce((a,l)=>a+l.placements.length,0)+'</strong></div><div class="stat">Heavy haul for review<strong>'+p.heavy.length+'</strong></div><div class="stat">Unplanned pieces<strong>'+p.rejected.length+'</strong></div></div>';
for(const l of p.loads){
  const fullLength=l.spec.length+(l.spec.upper_length||0);
  const usedL=Math.max(0,...l.placements.map(q=>q.x+q.length));
  const usedW=Math.max(0,...l.placements.map(q=>q.y+q.width));
  const height=Math.max(0,...l.placements.map(q=>q.item.height));
  const deckWidth=Math.min(l.spec.width,LEGAL_WIDTH);
  const displayWidth=Math.max(deckWidth,usedW);
  const deckOffset=(displayWidth-deckWidth)/2;
  const overwidthCount=l.placements.filter(q=>q.width>LEGAL_WIDTH).length;
  const legalLine=displayWidth>deckWidth?'<div class="legal-width-line" style="top:'+(deckOffset/displayWidth*100)+'%"></div><div class="legal-width-line" style="top:'+((deckOffset+deckWidth)/displayWidth*100)+'%"></div>':'';
  const sides=lateralWeight(l);
  const sideLabel='Top '+fmt(sides.top/l.weight*100,0)+'% · Bottom '+fmt(sides.bottom/l.weight*100,0)+'% of weight';
  const weightLabel=fmt(l.weight,0)+' / '+fmt(l.spec.max_weight,0)+' lb ('+fmt(l.weight/l.spec.max_weight*100,0)+'%)';
  const divider=l.spec.upper_length?'<div class="deck-divider" style="left:'+(l.spec.upper_length/fullLength*100)+'%"><span>Upper · '+fmt(l.spec.upper_length)+' in</span><span>Lower · '+fmt(l.spec.length)+' in</span></div>':'';
  html+='<article class="loadcard"><div class="loadhead"><strong>Truck '+l.number+' · '+esc(l.spec.name)+(singlePieceOnly(l.spec)?' · Single piece':'')+'</strong><span class="loadmeta">'+l.placements.length+' pieces · '+fmt(usedL/12)+' ft occupied through rear · '+weightLabel+(overwidthCount?' · '+overwidthCount+' OD width':'')+'</span></div><div class="loadbody"><div><div class="deck" aria-label="Top down placement diagram"><div class="balance-midline"></div>'+divider+legalLine+l.placements.map(q=>'<div class="placement'+(q.width>LEGAL_WIDTH?' overwidth':'')+'" tabindex="0" data-tooltip="'+esc(placementTooltip(q)).replace(/\n/g,'&#10;')+'" aria-describedby="pieceTooltip" aria-label="'+esc(placementTooltip(q)).replace(/\n/g,'; ')+'" style="left:'+(q.x/fullLength*100)+'%;top:'+(((q.width>deckWidth?(deckWidth-q.width)/2:q.y)+deckOffset)/displayWidth*100)+'%;width:'+(q.length/fullLength*100)+'%;height:'+(q.width/displayWidth*100)+'%"><span>'+esc(q.item.item_id)+'</span></div>').join('')+'</div><div class="dimline">Front → rear · '+(l.spec.upper_length?fmt(l.spec.upper_length)+' in upper + ':'')+fmt(l.spec.length)+' in '+(l.spec.upper_length?'lower':'deck')+' · width '+fmt(l.spec.width)+' in deck width'+(overwidthCount?' · '+fmt(displayWidth)+' in cargo width':'')+'<br>'+sideLabel+'</div></div><div><div class="loadmeta">Occupied envelope: '+fmt(usedL)+' × '+fmt(usedW)+' × '+fmt(height)+' in<br>Total weight: '+weightLabel+'</div><div class="loadpieces">'+l.placements.map(q=>'<div>'+esc(q.item.item_id)+' · '+esc(q.zone)+' · '+fmt(q.length/12)+' × '+fmt(q.width/12)+' ft'+(q.rotated?' · rotated':'')+'</div>').join('')+'</div></div></div></article>';
}
if(p.rejected.length)html+='<div class="exception"><strong>Unplanned pieces</strong><ul>'+p.rejected.map(x=>'<li>'+esc(x.item.item_id)+': '+esc(x.reason)+'</li>').join('')+'</ul></div>';
if(!p.loads.length&&!p.rejected.length)html+='<div class="empty">No standard cargo to plan. Review heavy haul pieces separately.</div>';
$('#planContent').innerHTML=html}
function formData(form){return Object.fromEntries(new FormData(form).entries())}
function resetItem(){const f=$('#itemForm');f.reset();f.elements.length_unit.value='ft';f.elements.rotatable.checked=false;$('#editIndex').value='';$('#itemSubmit').textContent='Add piece';$('#itemCancel').hidden=true}
$('#itemForm').addEventListener('submit',e=>{e.preventDefault();const f=e.currentTarget,d=formData(f);const i={item_id:d.item_id.trim(),length:+d.length,width:+d.width,height:+d.height,weight:+d.weight,quantity:+d.quantity,length_unit:d.length_unit,weight_unit:d.weight_unit,rotatable:f.elements.rotatable.checked};if(!i.item_id||![i.length,i.width,i.height,i.weight].every(x=>Number.isFinite(x)&&x>0)||!Number.isInteger(i.quantity)||i.quantity<1)return alertMsg('Enter positive dimensions, weight, and a whole-number quantity.',true);const k=$('#editIndex').value;if(k==='')state.items.push(i);else state.items[+k]=i;resetItem();invalidate()});
$('#itemCancel').onclick=resetItem;
$('#trailerForm').addEventListener('submit',e=>{e.preventDefault();const d=formData(e.currentTarget),s={name:d.name.trim(),single_piece_only:e.currentTarget.elements.single_piece_only.checked||d.name.trim()==='Stretch Step'||d.name.trim()==='Stretch RGN',length_first:["53' Flatbed","53' Stepdeck","53' Lo-Pro Stepdeck"].includes(d.name.trim()),length:+d.length,width:+d.width,height:+d.height,upper_length:+d.upper_length,upper_height:+d.upper_height,max_weight:+d.max_weight};if(!s.name||![s.length,s.width,s.height,s.max_weight].every(x=>Number.isFinite(x)&&x>0)||!Number.isFinite(s.upper_length)||s.upper_length<0||(s.upper_length>0&&s.upper_height<=0))return alertMsg('Enter positive deck limits. An upper deck needs a positive height.',true);const k=$('#trailerEditIndex').value;if(k==='')state.specs.push(s);else state.specs[+k]=s;resetTrailer();invalidate()});
function resetTrailer(){const f=$('#trailerForm');f.reset();$('#trailerEditIndex').value='';$('#trailerSubmit').textContent='Add trailer';$('#trailerCancel').hidden=true}$('#trailerCancel').onclick=resetTrailer;
function rowValue(row,key){return row.querySelector('[data-field="'+key+'"]')}
function rowError(row,message){row.querySelector('.row-error').textContent=message}
function saveItemRow(k){
  const row=document.querySelector('[data-edit-row="item"][data-index="'+k+'"]');
  if(!row)return;
  const get=key=>rowValue(row,key).value;
  const item={item_id:get('item_id').trim(),quantity:+get('quantity'),length:+get('length'),width:+get('width'),height:+get('height'),weight:+get('weight'),length_unit:get('length_unit'),weight_unit:get('weight_unit'),rotatable:rowValue(row,'rotatable').checked};
  if(!item.item_id||![item.length,item.width,item.height,item.weight].every(v=>Number.isFinite(v)&&v>0)||!Number.isInteger(item.quantity)||item.quantity<1){rowError(row,'Enter a name, positive dimensions and weight, and a whole-number quantity.');return}
  state.items[k]=item;state.editingItem=null;invalidate();
}
function saveTrailerRow(k){
  const row=document.querySelector('[data-edit-row="trailer"][data-index="'+k+'"]');
  if(!row)return;
  const get=key=>rowValue(row,key).value;
  const spec={name:get('name').trim(),length:+get('length'),upper_length:+get('upper_length'),width:+get('width'),height:+get('height'),upper_height:+get('upper_height'),max_weight:+get('max_weight'),single_piece_only:singlePieceOnly(state.specs[k])||rowValue(row,'single_piece_only').checked||get('name')==='Stretch Step'||get('name')==='Stretch RGN',length_first:lengthFirst(state.specs[k])||["53' Flatbed","53' Stepdeck","53' Lo-Pro Stepdeck"].includes(get('name'))};
  if(!spec.name||![spec.length,spec.width,spec.height,spec.max_weight].every(v=>Number.isFinite(v)&&v>0)||!Number.isFinite(spec.upper_length)||spec.upper_length<0||!Number.isFinite(spec.upper_height)||spec.upper_height<0||(spec.upper_length>0&&spec.upper_height<=0)){rowError(row,'Enter a name and valid positive deck limits. An upper deck needs a height.');return}
  state.specs[k]=spec;state.editingTrailer=null;invalidate();
}
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-action]');if(!b)return;
  const k=+b.dataset.index,a=b.dataset.action;
  if(a==='editItem'){state.editingItem=k;render();document.querySelector('[data-edit-row="item"] input')?.focus()}
  else if(a==='cancelItem'){state.editingItem=null;render()}
  else if(a==='saveItem')saveItemRow(k);
  else if(a==='deleteItem'){state.items.splice(k,1);state.editingItem=null;invalidate()}
  else if(a==='editTrailer'){state.editingTrailer=k;render();document.querySelector('[data-edit-row="trailer"] input')?.focus()}
  else if(a==='cancelTrailer'){state.editingTrailer=null;render()}
  else if(a==='saveTrailer')saveTrailerRow(k);
  else if(a==='deleteTrailer'){state.specs.splice(k,1);state.editingTrailer=null;invalidate()}
  else if(a==='up'||a==='down'){const j=k+(a==='up'?-1:1);if(j>=0&&j<state.specs.length){[state.specs[k],state.specs[j]]=[state.specs[j],state.specs[k]];state.editingTrailer=null;invalidate()}}
});
document.addEventListener('keydown',e=>{
  const row=e.target.closest('[data-edit-row]');if(!row)return;
  if(e.key==='Escape'){e.preventDefault();row.querySelector('[data-action^="cancel"]').click()}
  if(e.key==='Enter'&&e.target.tagName!=='SELECT'){e.preventDefault();row.querySelector('[data-action^="save"]').click()}
});
$('#clearCargo').onclick=()=>{if(!state.items.length)return;if(confirm('Remove all cargo pieces?')){state.items=[];resetItem();invalidate()}};
$('#planBtn').onclick=()=>{if(state.editingItem!==null||state.editingTrailer!==null){alertMsg('Save or cancel the row you are editing before creating a plan.',true);return}try{state.plan=optimize();clearExport();$('#exportBtn').disabled=false;$('#summaryExportBtn').disabled=false;render();showTab('plan');alertMsg('Plan created. Review each truck and any exceptions before loading.')}catch(e){alertMsg(e.message,true)}};
$('#pasteToggle').onclick=()=>{$('#pasteArea').hidden=false;$('#pasteText').focus()};$('#cancelPaste').onclick=()=>{$('#pasteArea').hidden=true};
const ALIASES={item_id:['item','item id','id','description','part','part number','sku'],length:['length','len','l'],width:['width','wid','w'],height:['height','ht','h'],weight:['weight','wt','gross weight'],quantity:['quantity','qty','pieces','pcs'],length_unit:['length unit','dimension unit','dim unit','units','unit'],weight_unit:['weight unit','weight units','wt unit'],rotatable:['rotatable','rotate','rotation allowed']};
function rowsToItems(rows){rows=rows.filter(r=>r.some(v=>String(v??'').trim()));if(!rows.length)return [];const headers=rows[0].map(String),col={};headers.forEach((h,k)=>{const clean=h.replace(/\([^)]*\)|\[[^\]]*\]/g,'').trim().toLowerCase().replace(/[_-]+/g,' ');for(const [field,aliases] of Object.entries(ALIASES))if(aliases.includes(clean)){col[field]=k;break}});const missing=['length','width','height','weight'].filter(x=>col[x]===undefined);if(missing.length)throw Error('Missing required columns: '+missing.join(', '));const unit=(h,kind)=>{const m=String(h).toLowerCase().match(/\b(mm|cm|kg|lbs|lb|ft|in|m)\b/);return m?.[1]||(kind==='weight'?'lb':'in')};return rows.slice(1).map((r,n)=>{const get=(field,def='')=>col[field]!==undefined&&r[col[field]]!==undefined&&String(r[col[field]]).trim()!==''?r[col[field]]:def;const i={item_id:String(get('item_id','Item '+(n+1))),length:+get('length'),width:+get('width'),height:+get('height'),weight:+get('weight'),quantity:+get('quantity',1),length_unit:String(get('length_unit',unit(headers[col.length],'length'))).trim().toLowerCase(),weight_unit:String(get('weight_unit',unit(headers[col.weight],'weight'))).trim().toLowerCase(),rotatable:['yes','y','true','1'].includes(String(get('rotatable','no')).trim().toLowerCase())};if(![i.length,i.width,i.height,i.weight].every(x=>Number.isFinite(x)&&x>0)||!Number.isInteger(i.quantity)||i.quantity<1||!LF[i.length_unit]||!WF[i.weight_unit])throw Error('Could not read data row '+(n+2)+': check values and units.');return i})}
function parseDelimited(text){const first=text.split(/\r?\n/).find(x=>x.trim())||'',sep=first.includes('\t')?'\t':',';let rows=[],row=[],field='',quoted=false;for(let k=0;k<text.length;k++){const c=text[k];if(c==='"'){if(quoted&&text[k+1]==='"'){field+='"';k++}else quoted=!quoted}else if(c===sep&&!quoted){row.push(field);field=''}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[k+1]==='\n')k++;row.push(field);rows.push(row);row=[];field=''}else field+=c}if(quoted)throw Error('Unclosed quote in pasted data.');if(field||row.length){row.push(field);rows.push(row)}return rows}
$('#importPaste').onclick=()=>{try{const items=rowsToItems(parseDelimited($('#pasteText').value));if(!items.length)throw Error('No data rows found.');state.items.push(...items);$('#pasteArea').hidden=true;$('#pasteText').value='';invalidate();alertMsg('Added '+items.length+' cargo rows.')}catch(e){alertMsg(e.message,true)}};
const xml=s=>new DOMParser().parseFromString(s,'application/xml');
const local=(root,name)=>[...root.getElementsByTagName('*')].filter(n=>n.localName===name);
async function xlsxRows(buffer){const zip=await JSZip.loadAsync(buffer),get=async p=>zip.file(p)?.async('string');const wb=xml(await get('xl/workbook.xml')),rels=xml(await get('xl/_rels/workbook.xml.rels'));const sheet=local(wb,'sheet')[0];if(!sheet)throw Error('Workbook has no sheets.');const rid=sheet.getAttribute('r:id')||sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');const rel=local(rels,'Relationship').find(n=>n.getAttribute('Id')===rid);let path=rel?.getAttribute('Target')||'worksheets/sheet1.xml';path=path.startsWith('/')?path.slice(1):'xl/'+path.replace(/^\.\.\//,'');const data=await get(path);if(!data)throw Error('Could not read the first worksheet.');const shared=await get('xl/sharedStrings.xml');const strings=shared?local(xml(shared),'si').map(n=>local(n,'t').map(t=>t.textContent).join('')):[];return local(xml(data),'row').map(r=>{let out=[],seq=0;for(const c of [...r.children].filter(n=>n.localName==='c')){const ref=c.getAttribute('r')||'',letters=ref.match(/^[A-Z]+/)?.[0];let idx=letters?[...letters].reduce((a,ch)=>a*26+ch.charCodeAt(0)-64,0)-1:seq;const v=[...c.children].find(n=>n.localName==='v')?.textContent??'';const inline=local(c,'t').map(n=>n.textContent).join('');out[idx]=c.getAttribute('t')==='s'?strings[+v]??'':c.getAttribute('t')==='inlineStr'?inline:v;seq=idx+1}return out})}
async function pdfRows(buffer){const doc=await pdfjsLib.getDocument({data:new Uint8Array(buffer)}).promise;const all=[];for(let p=1;p<=doc.numPages;p++){const page=await doc.getPage(p),content=await page.getTextContent();const fragments=content.items.filter(i=>i.str?.trim()).map(i=>({x:i.transform[4],y:i.transform[5],s:i.str.trim()})).sort((a,b)=>b.y-a.y||a.x-b.x);const lines=[];for(const f of fragments){let line=lines.find(l=>Math.abs(l.y-f.y)<3);if(!line){line={y:f.y,parts:[]};lines.push(line)}line.parts.push(f)}lines.sort((a,b)=>b.y-a.y);for(const line of lines){const parts=line.parts.sort((a,b)=>a.x-b.x);all.push(parts.map(x=>x.s))}}if(!all.length)throw Error('No text found in PDF. Scanned PDFs need OCR.');try{return rowsToItems(all)}catch{throw Error('A consistent table was not detected. Copy the PDF table rows into Paste rows instead.')}}
$('#fileInput').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{let items;if(/\.csv$/i.test(file.name))items=rowsToItems(parseDelimited(await file.text()));else if(/\.(xlsx|xlsm)$/i.test(file.name))items=rowsToItems(await xlsxRows(await file.arrayBuffer()));else if(/\.pdf$/i.test(file.name))items=await pdfRows(await file.arrayBuffer());else throw Error('Supported files are CSV, XLSX, XLSM, and table based PDF.');if(!items.length)throw Error('No cargo rows found.');state.items.push(...items);invalidate();alertMsg('Imported '+items.length+' cargo rows from '+file.name+'.')}catch(err){alertMsg(err.message,true)}finally{e.target.value=''}};
const XESC=s=>String(s??'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
function worksheet(rows,filterEnd=rows.length){const cols=rows[0].length;let data=rows.map((row,ri)=>'<row r="'+(ri+1)+'">'+row.map((v,ci)=>{const ref=String.fromCharCode(65+ci)+(ri+1);return typeof v==='number'?'<c r="'+ref+'"><v>'+v+'</v></c>':'<c r="'+ref+'" t="inlineStr"><is><t>'+XESC(v)+'</t></is></c>'}).join('')+'</row>').join('');return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:'+String.fromCharCode(64+cols)+rows.length+'"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>'+data+'</sheetData><autoFilter ref="A1:'+String.fromCharCode(64+cols)+filterEnd+'"/></worksheet>'}
async function exportExcel(){const p=state.plan;if(!p)return;const summary=summaryRows(p),review=heavySummaryRows(p);if(p.heavy.length)summary.push([],['Heavy Haul Items (excluded from automatic plan)'],...review);const z=new JSZip();z.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');z.file('_rels/.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');z.file('xl/workbook.xml','<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Load Plan Summary" sheetId="1" r:id="rId1"/><sheet name="Heavy Haul Review" sheetId="2" r:id="rId2"/></sheets></workbook>');z.file('xl/_rels/workbook.xml.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>');z.file('xl/worksheets/sheet1.xml',worksheet(summary,p.loads.length+1));z.file('xl/worksheets/sheet2.xml',worksheet(review));const blob=await z.generateAsync({type:'blob',compression:'DEFLATE'});if(exportObjectUrl)URL.revokeObjectURL(exportObjectUrl);exportObjectUrl=URL.createObjectURL(blob);for(const link of [$('#exportLink'),$('#summaryExportLink')]){link.href=exportObjectUrl;link.hidden=false}const link=$('#summary').classList.contains('active')?$('#summaryExportLink'):$('#exportLink');link.click()}
for(const button of [$('#exportBtn'),$('#summaryExportBtn')])button.onclick=async()=>{button.disabled=true;button.textContent='Preparing Excel…';try{await exportExcel()}catch(e){alertMsg('Excel export failed: '+e.message,true)}finally{button.disabled=false;button.textContent='Export Excel summary'}};
const pieceTip=$('#pieceTooltip');
let activePiece=null;
function movePieceTip(x,y){
  const margin=12;
  const rect=pieceTip.getBoundingClientRect();
  const left=Math.max(margin,Math.min(x+14,window.innerWidth-rect.width-margin));
  const below=y+16;
  const top=below+rect.height+margin>window.innerHeight
    ? Math.max(margin,y-rect.height-16):below;
  pieceTip.style.left=left+'px';
  pieceTip.style.top=top+'px';
}
function showPieceTip(piece,event){
  activePiece=piece;
  pieceTip.textContent=piece.dataset.tooltip;
  pieceTip.hidden=false;
  const rect=piece.getBoundingClientRect();
  movePieceTip(event?.clientX??rect.left,event?.clientY??rect.top);
}
function hidePieceTip(){activePiece=null;pieceTip.hidden=true}
document.addEventListener('pointerover',event=>{
  const piece=event.target.closest('.placement');
  if(piece)showPieceTip(piece,event);
});
document.addEventListener('pointermove',event=>{
  if(activePiece&&activePiece.contains(event.target))movePieceTip(event.clientX,event.clientY);
});
document.addEventListener('pointerout',event=>{
  const piece=event.target.closest('.placement');
  if(piece&&event.pointerType!=='touch'&&!piece.contains(event.relatedTarget))hidePieceTip();
});
document.addEventListener('pointerdown',event=>{
  if(event.pointerType!=='touch')return;
  const piece=event.target.closest('.placement');
  if(piece)showPieceTip(piece,event);
  else hidePieceTip();
});
document.addEventListener('focusin',event=>{
  const piece=event.target.closest('.placement');
  if(piece)showPieceTip(piece);
});
document.addEventListener('focusout',event=>{
  if(event.target.closest('.placement'))hidePieceTip();
});
window.addEventListener('scroll',hidePieceTip,true);
window.addEventListener('resize',hidePieceTip);
render();

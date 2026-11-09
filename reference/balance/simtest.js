global.window = {};
class DCLogic { constructor(p){ this.props = p || {}; } setState(u){ if(typeof u==='function') u=u(this.state); Object.assign(this.state,u);} }
global.DCLogic = DCLogic;
const C = eval(require('fs').readFileSync(process.argv[2],'utf8') + '\n;Component');
const c = new C({}); c.toast=()=>{}; c.riversXZ=[]; c.three={scene:{remove(){}}}; c.setConstruction=()=>{}; c.state.loading=false;
const mk=(type,units,extra)=>Object.assign({type,name:type,units:units.map(cap=>({cap,out:0,why:''})),mw:units.reduce((a,b)=>a+b,0),build:0,buildTotal:0,ytd:0,loc:1,root:{userData:{rotors:[]},scale:{}},sprites:[]},extra||{});
c.plants=[]; c.addStarter=()=>c.plants.push(mk('nuclear',[505,505],{locked:true})); c.hidden=[];
c.newGame();
const strat=process.argv[3];
const buy=(type,n,loc)=>{const it=c.itemBy[type]; for(let i=0;i<n;i++){ c.plants.push(mk(type,[it.mw],{build:it.build,buildTotal:it.build,loc:loc||1})); c.sim.money-=it.price; c.sim.y.capex+=it.price; }};
for(let yr=0; yr<4; yr++){
  if(strat==='green'){ if(yr===0){buy('solar',30,1.05);buy('wind',30,1.15);buy('hydro',4);buy('battery',3);} if(yr===1){buy('solar',20,1.05);buy('wind',20,1.15);buy('pumped',2);} if(yr===2){buy('solar',15,1.05);buy('wind',15,1.15);buy('battery',4);} }
  let d=0; while(!c.sim.yearDone){ c.stepDay(false); d++; if(d===180){ const v=c.renderVals(); if(yr===0) console.log('HUD slots',JSON.stringify(v.slots.map(s=>[s.label,s.top,s.demB,s.segs.length])),'missions',v.missions.map(m=>m.icon+m.prog).join(' | ')); } }
  const r=c.state.report; const g=k=>r.rows.find(x=>x.k===k).v;
  console.log(c.sim.year,'grade',r.grade,r.total,r.scores.map(s=>s.label.slice(0,5)+':'+s.score).join(' '),'| OZE',g('Obnoviteľné zdroje'),'imp',g('Import'),'store',g('Úložiská vrátili'),'CO2',g('Priemer CO₂'),'money',g('Peniaze na konci roka'));
  console.log('   missions:', r.missions.map(m=>m.icon+' '+m.text.slice(0,30)+' '+m.prog+' '+m.money).join(' || '));
  console.log('   day:', r.dayRows.map(x=>x.label+':'+Math.round(x.price)+'€ dem'+Math.round(x.dem)+' sol'+Math.round(x.out.solar)+' dis'+Math.round(x.dis)+' chg'+Math.round(x.chg)).join(' '));
  c.state.quizPicks={0:1}; const v=c.renderVals(); console.log('   quiz:', v.quiz.map(q=>q.q.slice(0,40)+' ans='+q.answered+' '+q.expl.slice(0,50)).join(' || '), 'open:', v.openQ.slice(0,50), 'mon', v.monChart.length, v.dayChart.length);
  c.state.modal='year'; if(yr<3) c.onModalAction();
}

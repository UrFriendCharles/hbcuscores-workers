/** scheduler.js */
const MODES={offseason:{label:'offseason',sports:['fb','mbb','wbb'],tickMinutes:null},in_season:{label:'in_season',sports:['fb','mbb','wbb'],tickMinutes:15},tournament:{label:'tournament',sports:['mbb','wbb'],tickMinutes:5}};
export function pickMode(now=new Date(),override=null){if(override&&MODES[override])return MODES[override];const m=now.getUTCMonth()+1;const d=now.getUTCDate();const mmdd=m*100+d;// Tournament: mid-February through end of April (D1/D2/NAIA postseasons)
if(mmdd>=215&&mmdd<=430)return MODES.tournament;const fb=mmdd>=815&&mmdd<=1220;// Basketball in-season: Nov 1 through mid-February (pre-tournament)
const bb=mmdd>=1101||mmdd<=214;if(fb||bb)return MODES.in_season;return MODES.offseason}
export function shouldRunTick(mode,now=new Date()){if(mode.label==='tournament')return true;const min=now.getUTCMinutes();const hr=now.getUTCHours();if(mode.label==='in_season')return min%15===0;if(mode.label==='offseason')return hr===12&&min<5;return false}
export function sportsForTick(mode,env={}){const skip=new Set((env.SCHEDULER_SKIP_SPORTS||'').split(',').map(s=>s.trim()).filter(Boolean));return mode.sports.filter(s=>!skip.has(s))}
export function planTick(env={},now=new Date()){const mode=pickMode(now,env.SCHEDULER_MODE);const shouldRun=shouldRunTick(mode,now);const sports=shouldRun?sportsForTick(mode,env):[];return{mode:mode.label,sports,shouldRun}}
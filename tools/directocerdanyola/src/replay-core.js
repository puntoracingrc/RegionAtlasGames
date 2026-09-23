/* Pure helpers for reconstructing a race from public MyRCM lap crossings. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CerdanyolaReplayCore=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';

function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
function median(values){
  const ordered=values.filter(Number.isFinite).slice().sort((a,b)=>a-b);if(!ordered.length)return 0;
  const middle=Math.floor(ordered.length/2);return ordered.length%2?ordered[middle]:(ordered[middle-1]+ordered[middle])/2;
}
function formatClock(value){
  const seconds=Math.max(0,Number(value)||0),minutes=Math.floor(seconds/60),rest=Math.floor(seconds%60);
  return `${minutes}:${String(rest).padStart(2,'0')}`;
}
function formatLap(value){
  const seconds=Number(value);if(!Number.isFinite(seconds)||seconds<=0)return '';
  if(seconds<60)return seconds.toFixed(3);
  const minutes=Math.floor(seconds/60);return `${minutes}:${(seconds-minutes*60).toFixed(3).padStart(6,'0')}`;
}
function motionTimeline(relativeSpeeds){
  const speeds=(relativeSpeeds||[]).map(value=>clamp(Number(value)||1,.25,2.5));
  if(!speeds.length)return {speeds:[1],cumulativeTimes:[0,1],segmentCount:1};
  const weights=speeds.map(speed=>1/speed),total=weights.reduce((sum,value)=>sum+value,0)||1;
  let elapsed=0;const cumulativeTimes=[0];
  for(const weight of weights){elapsed+=weight/total;cumulativeTimes.push(elapsed);}
  cumulativeTimes[cumulativeTimes.length-1]=1;
  return {speeds,cumulativeTimes,segmentCount:speeds.length};
}
function pacedProgress(timePercent,timeline){
  const time=clamp((Number(timePercent)||0)/100,0,1),times=timeline&&timeline.cumulativeTimes,segments=timeline&&timeline.segmentCount||0;
  if(!times||!segments)return time*100;
  let low=0,high=segments;
  while(low<high){const middle=(low+high)>>1;if(times[middle+1]<time)low=middle+1;else high=middle;}
  const start=times[low],end=times[low+1],within=end>start?(time-start)/(end-start):0;
  return clamp((low+within)/segments*100,0,100);
}
function prepareReplay(data){
  const scheduledSeconds=Number(data.scheduledSeconds)||1800;
  const drivers=(data.drivers||[]).map((driver,index)=>{
    const startOffsetSeconds=Math.max(0,Number(driver.startOffsetSeconds)||0);
    let total=startOffsetSeconds,best=Infinity;
    const crossings=(driver.laps||[]).map(entry=>{const seconds=Number(entry.seconds);total+=seconds;best=Math.min(best,seconds);return {lap:Number(entry.lap),seconds,at:total,best};});
    const centre=median(crossings.map(entry=>entry.seconds)),clean=median(crossings.map(entry=>entry.seconds).filter(seconds=>!centre||(seconds>=centre*.75&&seconds<=centre*1.25)))||centre;
    return {name:String(driver.name||`Piloto ${index+1}`),seedIndex:index,startOffsetSeconds,crossings,totalSeconds:total,finalLaps:crossings.length,firstCrossing:crossings[0]&&crossings[0].at||Infinity,cleanLapSeconds:clean,completedRace:crossings.length>0&&total>=scheduledSeconds-10};
  });
  const offsets=drivers.map(driver=>driver.startOffsetSeconds).filter(value=>value>0),startBaselineSeconds=median(offsets);
  const startMadSeconds=median(offsets.map(value=>Math.abs(value-startBaselineSeconds)));
  const startDelayThresholdSeconds=Math.max(5,startMadSeconds*4);
  const durationSeconds=Math.max(0,...drivers.map(driver=>driver.totalSeconds));
  return {...data,scheduledSeconds,durationSeconds,startBaselineSeconds,startDelayThresholdSeconds,signalLossHideSeconds:60,drivers};
}
function completedCount(crossings,elapsed){
  let low=0,high=crossings.length;
  while(low<high){const middle=(low+high)>>1;if(crossings[middle].at<=elapsed)low=middle+1;else high=middle;}
  return low;
}
function realLapDeficit(ahead,behind){
  const distanceDifference=Number(ahead&&ahead.distance)-Number(behind&&behind.distance);
  if(!Number.isFinite(distanceDifference)||distanceDifference<1)return 0;
  return Math.max(0,Math.floor(distanceDifference+1e-9));
}
function gapLabel(ahead,behind){
  const lapDeficit=realLapDeficit(ahead,behind);
  if(lapDeficit>=1)return `-${lapDeficit}`;
  const countedLapDifference=ahead.laps-behind.laps;
  if(countedLapDifference>=1){
    const nextComparableCrossing=behind.crossings[Number(ahead.laps)-1],aheadCrossing=ahead.crossings[Number(ahead.laps)-1];
    if(nextComparableCrossing&&aheadCrossing)return `+${Math.max(0,nextComparableCrossing.at-aheadCrossing.at).toFixed(3)}`;
  }
  return `+${Math.max(0,behind.totalSeconds-ahead.totalSeconds).toFixed(3)}`;
}
function frame(prepared,elapsedSeconds){
  const elapsed=clamp(Number(elapsedSeconds)||0,0,prepared.durationSeconds);
  const raw=prepared.drivers.map(driver=>{
    const completed=completedCount(driver.crossings,elapsed),last=completed?driver.crossings[completed-1]:null,next=driver.crossings[completed]||null,startPhase=driver.startOffsetSeconds>0&&elapsed<driver.startOffsetSeconds,lastAt=last?last.at:driver.startOffsetSeconds;
    const startDelaySeconds=Math.max(0,driver.startOffsetSeconds-prepared.startBaselineSeconds),delayedStart=startDelaySeconds>prepared.startDelayThresholdSeconds;
    const startDelayActive=(delayedStart&&startPhase&&elapsed>prepared.startBaselineSeconds+prepared.startDelayThresholdSeconds)||(driver.finalLaps===0&&elapsed>prepared.startBaselineSeconds+prepared.startDelayThresholdSeconds&&elapsed<prepared.durationSeconds);
    const didNotStart=driver.finalLaps===0&&elapsed>=prepared.durationSeconds;
    const currentLapSeconds=startPhase?driver.startOffsetSeconds:next?next.at-lastAt:null,sinceLastCrossing=completed>0?Math.max(0,elapsed-lastAt):0,signalAlertSeconds=Math.max(25,(driver.cleanLapSeconds||currentLapSeconds||20)*1.5);
    const normalFinish=!next&&driver.completedRace,anomalousInterval=completed>0&&!normalFinish&&((next&&currentLapSeconds>signalAlertSeconds)||!next),missingCrossing=anomalousInterval&&sinceLastCrossing>=signalAlertSeconds,hiddenAfterNoCrossing=anomalousInterval&&sinceLastCrossing>=prepared.signalLossHideSeconds;
    const motionSeconds=anomalousInterval?(driver.cleanLapSeconds||currentLapSeconds):currentLapSeconds;
    const progress=startPhase?clamp((.82+elapsed/Math.max(.001,driver.startOffsetSeconds)*.18)*100,82,99.999):next?clamp((elapsed-lastAt)/Math.max(.001,motionSeconds)*100,0,99.5):0,distance=completed+progress/100;
    const lastLapSeconds=last?(completed===1?last.seconds+driver.startOffsetSeconds:last.seconds):null,bestSeconds=last&&last.best||null,totalSeconds=last?last.at:0,averageSeconds=completed?totalSeconds/completed:null;
    return {...driver,laps:completed,lastLapSeconds,bestSeconds,totalSeconds,averageSeconds,currentLapSeconds,progress,distance,startPhase,startDelaySeconds,delayedStart,startDelayActive,didNotStart,sinceLastCrossing,signalAlertSeconds,missingCrossing,hiddenAfterNoCrossing,finished:driver.completedRace&&!next&&completed===driver.finalLaps};
  });
  raw.sort((a,b)=>b.laps-a.laps||a.totalSeconds-b.totalSeconds||a.seedIndex-b.seedIndex);
  const drivers=raw.map((driver,index)=>{
    const ahead=raw[index-1],leader=raw[0];
    return {
      key:`replay-${driver.seedIndex}`,position:index+1,start:driver.seedIndex+1,number:'',name:driver.name,firstName:'',lastName:'',transponder:'',
      laps:driver.laps,lastLap:formatLap(driver.lastLapSeconds),lastLapSeconds:driver.lastLapSeconds,total:formatLap(driver.totalSeconds),totalSeconds:driver.totalSeconds,
      best:formatLap(driver.bestSeconds),bestSeconds:driver.bestSeconds,average:formatLap(driver.averageSeconds),averageSeconds:driver.averageSeconds,forecast:'',
      gapFirst:index?gapLabel(leader,driver):'0.000',gapPrevious:index?gapLabel(ahead,driver):'0.000',realLapDeficit:index?realLapDeficit(leader,driver):0,trend:0,positionChange:0,stateColor:driver.finished&&elapsed<prepared.durationSeconds?4:0,
      progress:driver.progress,replayDistance:driver.distance,currentLapSeconds:driver.currentLapSeconds,startPhase:driver.startPhase,startDelaySeconds:driver.startDelaySeconds,delayedStart:driver.delayedStart,startDelayActive:driver.startDelayActive,didNotStart:driver.didNotStart,sinceLastCrossing:driver.sinceLastCrossing,signalAlertSeconds:driver.signalAlertSeconds,missingCrossing:driver.missingCrossing,hiddenAfterNoCrossing:driver.hiddenAfterNoCrossing,finished:driver.finished
    };
  });
  return {elapsed,durationSeconds:prepared.durationSeconds,scheduledSeconds:prepared.scheduledSeconds,percentage:prepared.durationSeconds?elapsed/prepared.durationSeconds*100:0,drivers,finished:elapsed>=prepared.durationSeconds};
}

return {clamp,median,formatClock,formatLap,motionTimeline,pacedProgress,prepareReplay,completedCount,realLapDeficit,gapLabel,frame};
});

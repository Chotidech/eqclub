// ====== STATE ======
let audioCtx, analyser, dataArray;

let frames = [];
let collecting = false;
let isRecording = false;

let currentPoint = 0;
let totalPoints = 4;
let allPoints = [];

let rafId = null;

// ====== INIT ======
function initUI(){
  renderDots();
  setCountdown("READY");
}

async function initAudio(){
  if(audioCtx) return;

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  const stream = await navigator.mediaDevices.getUserMedia({audio:true});
  const source = audioCtx.createMediaStreamSource(stream);

  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;

  source.connect(analyser);

  dataArray = new Uint8Array(analyser.frequencyBinCount);
}

// ====== RECORD FLOW ======
async function startRec(){
  if(isRecording) return;

  await initAudio();

  isRecording = true;
  collecting = true;
  frames = [];

  let t = 10;
  setCountdown(t);

  const timer = setInterval(()=>{
    t--;
    setCountdown(t);

    if(t <= 0){
      clearInterval(timer);
      collecting = false;
      isRecording = false;

      savePoint();
      setCountdown("SAVED");
    }
  },1000);

  captureLoop();
}

function captureLoop(){
  if(!collecting) return;

  analyser.getByteFrequencyData(dataArray);
  frames.push(new Float32Array(dataArray));

  draw(dataArray);

  rafId = requestAnimationFrame(captureLoop);
}

// ====== SAVE / NAV ======
function savePoint(){
  if(frames.length < 5){
    alert("ข้อมูลไม่พอ");
    return;
  }

  const med = medianFFT(trim(frames));
  allPoints[currentPoint] = med;
}

function nextPoint(){
  if(isRecording) return;

  if(currentPoint < totalPoints - 1){
    currentPoint++;
    renderDots();
    setCountdown("READY");
  }
}

function resetAll(){
  currentPoint = 0;
  allPoints = [];
  frames = [];
  collecting = false;
  isRecording = false;

  if(rafId) cancelAnimationFrame(rafId);

  setCountdown("READY");
  document.getElementById("cards").innerHTML = "";

  renderDots();
}

// ====== ANALYZE ======
function analyze(){
  if(isRecording) return;

  // validate
  for(let i=0;i<totalPoints;i++){
    if(!allPoints[i]){
      alert("ยังวัดไม่ครบ");
      return;
    }
  }

  const avg = averageFFT(allPoints);

  draw(avg);

  const bands = analyzeBands(avg);
  const balance = getBalance(bands);

  renderCards(bands, balance);
}

// ====== UI ======
function setCountdown(v){
  document.getElementById("countdown").innerText = v;
}

function renderDots(){
  const el = document.getElementById("dots");
  el.innerHTML = "";

  for(let i=0;i<totalPoints;i++){
    const d = document.createElement("div");
    d.className = "dot";
    if(i === currentPoint) d.classList.add("active");
    el.appendChild(d);
  }
}

function renderCards(b, bal){
  const el = document.getElementById("cards");

  el.innerHTML = `
    ${card("LOW", b.low, bal.low)}
    ${card("MID", b.mid, bal.mid)}
    ${card("HIGH", b.high, bal.high)}
  `;
}

function card(name, val, bal){
  let cls = "ok";
  let text = "ปกติ";

  if(bal > 5){ cls="bad"; text="เกิน"; }
  else if(bal < -5){ cls="warn"; text="ขาด"; }

  return `
    <div class="card ${cls}">
      <h4>${name}</h4>
      <div class="value">${val.toFixed(0)}</div>
      <div class="delta">${bal>0?"+":""}${bal.toFixed(0)} ${text}</div>
    </div>
  `;
}

// ====== DSP ======
function medianFFT(arr){
  const size = arr[0].length;
  const res = new Float32Array(size);

  for(let i=0;i<size;i++){
    const vals = arr.map(a=>a[i]).sort((a,b)=>a-b);
    res[i] = vals[Math.floor(vals.length/2)];
  }

  return res;
}

function averageFFT(arr){
  const size = arr[0].length;
  const res = new Float32Array(size);

  for(let i=0;i<size;i++){
    res[i] = arr.reduce((s,a)=>s+a[i],0) / arr.length;
  }

  return res;
}

function trim(arr){
  const l = arr.length;
  return arr.slice(Math.floor(l*0.1), Math.floor(l*0.9));
}

function analyzeBands(data){
  let low=0, mid=0, high=0;
  let lc=0, mc=0, hc=0;

  for(let i=1;i<data.length;i++){
    const f = i * audioCtx.sampleRate / analyser.fftSize;

    if(f < 120){ low += data[i]; lc++; }
    else if(f < 2000){ mid += data[i]; mc++; }
    else if(f < 10000){ high += data[i]; hc++; }
  }

  return {
    low: low/lc,
    mid: mid/mc,
    high: high/hc
  };
}

function getBalance(b){
  const avg = (b.low + b.mid + b.high) / 3;

  return {
    low: b.low - avg,
    mid: b.mid - avg,
    high: b.high - avg
  };
}

// ====== DRAW (BLOCK STYLE) ======
function draw(data){
  const c = document.getElementById("canvas");
  const ctx = c.getContext("2d");

  ctx.clearRect(0,0,c.width,c.height);

  const bars = 12;
  const step = Math.floor(data.length / bars);
  const w = c.width / bars;

  for(let i=0;i<bars;i++){
    let val = 0;

    for(let j=0;j<step;j++){
      val += data[i*step + j];
    }

    val /= step;

    const h = (val / 255) * c.height;

    ctx.fillStyle = "#1eeea1";
    ctx.fillRect(i*w, c.height - h, w - 4, h);
  }
}

// ====== START ======
initUI();
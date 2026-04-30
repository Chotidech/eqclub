let audioCtx, analyser, dataArray;
let frames = [];
let collecting = false;
let loopId = null;
let currentPoint = 0;
const TOTAL_POINTS = 4;
let allPoints = new Array(TOTAL_POINTS).fill(null);

function init() {
  renderDots();
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  drawIdle();
}

function resizeCanvas() {
  const c = document.getElementById('canvas');
  c.width = c.offsetWidth * (window.devicePixelRatio || 1);
  c.height = c.offsetHeight * (window.devicePixelRatio || 1);
}

async function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  const source = audioCtx.createMediaStreamSource(stream);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  dataArray = new Uint8Array(analyser.frequencyBinCount);
}

async function startRec() {
  if (collecting) return;
  try { await initAudio(); }
  catch(e) { setCountdown('NO MIC', false); return; }

  if (loopId) { clearTimeout(loopId); loopId = null; }

  frames = [];
  collecting = true;
  setButtons(true);
  document.getElementById('recIndicator').classList.add('visible');
  document.getElementById('canvasWrap').classList.add('recording-active');

  let t = 10;
  setCountdown(t, true);

  const timer = setInterval(() => {
    t--;
    setCountdown(t, true);
    if (t <= 0) { clearInterval(timer); stopRec(); }
  }, 1000);

  captureLoop();
}

function stopRec() {
  collecting = false;
  if (loopId) { clearTimeout(loopId); loopId = null; }
  document.getElementById('recIndicator').classList.remove('visible');
  document.getElementById('canvasWrap').classList.remove('recording-active');
  savePoint();
  setCountdown('SAVED', false);
  setButtons(false);
  renderDots();
  setTimeout(() => { if (!collecting) setCountdown('READY', false); }, 1200);
}

function captureLoop() {
  if (!collecting) return;
  analyser.getByteFrequencyData(dataArray);
  frames.push(new Float32Array(dataArray));
  drawSpectrum(dataArray);
  loopId = setTimeout(captureLoop, 50);
}

function savePoint() {
  if (!frames.length) return;
  allPoints[currentPoint] = medianFFT(trimFrames(frames));
}

function nextPoint() {
  if (collecting) return;
  if (currentPoint < TOTAL_POINTS - 1) {
    currentPoint++;
    renderDots();
    setCountdown('READY', false);
    drawIdle();
    document.getElementById('result').style.display = 'none';
  }
}

function resetAll() {
  if (collecting) return;
  currentPoint = 0;
  allPoints = new Array(TOTAL_POINTS).fill(null);
  frames = [];
  renderDots();
  setCountdown('READY', false);
  drawIdle();
  document.getElementById('result').style.display = 'none';
}

function analyze() {
  const ready = allPoints.filter(p => p !== null);
  if (ready.length === 0) {
    setCountdown('NO DATA', false);
    setTimeout(() => setCountdown('READY', false), 1500);
    return;
  }
  const avg = averageFFT(ready);
  drawSpectrum(avg);
  const bands = analyzeBands(avg);
  const balance = getBalance(bands);
  renderResult(bands, balance, getSuggestions(balance));
}

function medianFFT(arr) {
  const size = arr[0].length;
  const res = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const vals = arr.map(a => a[i]).sort((a, b) => a - b);
    res[i] = vals[Math.floor(vals.length / 2)];
  }
  return res;
}

function averageFFT(arr) {
  const size = arr[0].length;
  const res = new Float32Array(size);
  for (let i = 0; i < size; i++) res[i] = arr.reduce((s,a) => s + a[i], 0) / arr.length;
  return res;
}

function trimFrames(arr) {
  const l = arr.length;
  return arr.slice(Math.floor(l * 0.1), Math.floor(l * 0.9));
}

function analyzeBands(data) {
  let low=0,mid=0,high=0,lc=0,mc=0,hc=0;
  for (let i = 1; i < data.length; i++) {
    const f = i * audioCtx.sampleRate / analyser.fftSize;
    if (f < 120)       { low  += data[i]; lc++; }
    else if (f < 2000) { mid  += data[i]; mc++; }
    else if (f < 10000){ high += data[i]; hc++; }
  }
  return { low: lc ? low/lc : 0, mid: mc ? mid/mc : 0, high: hc ? high/hc : 0 };
}

function getBalance(b) {
  const avg = (b.low + b.mid + b.high) / 3;
  return { low: b.low - avg, mid: b.mid - avg, high: b.high - avg };
}

function getSuggestions(b) {
  const T = 8, out = [];
  if (b.low  >  T) out.push({ type:'over',  text:'ลด Bass — LOW เกิน' });
  if (b.low  < -T) out.push({ type:'under', text:'เพิ่ม Bass — LOW ขาด' });
  if (b.mid  >  T) out.push({ type:'over',  text:'ลด Mid — เสียงกลางอึดอัด' });
  if (b.mid  < -T) out.push({ type:'under', text:'เพิ่ม Mid — เสียงกลางบาง' });
  if (b.high >  T) out.push({ type:'over',  text:'ลด High — แหลมแสบ' });
  if (b.high < -T) out.push({ type:'under', text:'เพิ่ม High — แหลมทึบ' });
  return out;
}

function renderDots() {
  const c = document.getElementById('dots');
  c.innerHTML = '';
  for (let i = 0; i < TOTAL_POINTS; i++) {
    const d = document.createElement('div');
    d.className = 'dot';
    if (allPoints[i] !== null) d.classList.add('done');
    else if (i === currentPoint) d.classList.add('active');
    c.appendChild(d);
  }
}

function setCountdown(val, isRecording) {
  const el = document.getElementById('countdown');
  el.className = isRecording ? 'recording' : (val === 'READY' || val === 'NO DATA' || val === 'NO MIC' ? 'ready' : 'saved');
  el.textContent = val === 'SAVED' ? 'SAVED \u2713' : val;
}

function setButtons(disabled) {
  ['btnRec','btnNext','btnAnalyze'].forEach(id => {
    document.getElementById(id).disabled = disabled;
  });
}

function renderResult(bands, balance, suggestions) {
  const r = document.getElementById('result');
  const cls = d => Math.abs(d) <= 8 ? 'ok' : d > 0 ? 'over' : 'under';
  const sign = d => (d >= 0 ? '+' : '') + d.toFixed(1);

  const cards = ['low','mid','high'].map(k => `
    <div class="band-card">
      <span class="band-name">${k.toUpperCase()}</span>
      <span class="band-val ${cls(balance[k])}">${bands[k].toFixed(0)}</span>
      <span class="band-delta ${cls(balance[k])}">${sign(balance[k])}</span>
    </div>`).join('');

  const sugs = suggestions.length === 0
    ? `<div class="sug-item all-ok"><span class="sug-icon">\u2713</span>Balance ดี — ระบบเสียงสมดุล</div>`
    : suggestions.map(s => `
        <div class="sug-item warn-${s.type}">
          <span class="sug-icon">${s.type === 'over' ? '\u25BC' : '\u25B2'}</span>${s.text}
        </div>`).join('');

  r.style.display = 'block';
  r.innerHTML = `
    <div class="band-grid fade-in">${cards}</div>
    <div class="suggestions fade-in">
      <div class="sug-header">RECOMMENDATION</div>${sugs}
    </div>`;
}

function drawIdle() {
  const c = document.getElementById('canvas');
  if (!c) return;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.strokeStyle = 'rgba(0,255,153,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, c.height / 2);
  ctx.lineTo(c.width, c.height / 2);
  ctx.stroke();
}

function drawSpectrum(data) {
  const c = document.getElementById('canvas');
  const ctx = c.getContext('2d');
  const W = c.width, H = c.height;
  ctx.clearRect(0, 0, W, H);
  const barW = W / data.length;
  for (let i = 0; i < data.length; i++) {
    const ratio = data[i] / 255;
    const h = ratio * H;
    ctx.fillStyle = `rgba(0,255,153,${(0.15 + ratio * 0.7).toFixed(2)})`;
    ctx.fillRect(i * barW, H - h, Math.max(barW - 1, 1), h);
  }
}

// เรียกใช้ฟังก์ชัน init เมื่อโหลดเสร็จ
init();

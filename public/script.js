const socket = io();

// UI Elements
const roleSelection    = document.getElementById('role-selection');
const controllerScreen = document.getElementById('controller-screen');
const displayScreen    = document.getElementById('display-screen');
const currentPartText  = document.getElementById('current-part-text');

let currentRole = null;
let activePart  = null;
let currentSong = 1;
let repeatColorState = 'red'; 
let configData  = {};

// --- Config 資料解析 ---
const rawConfig = `
1_V,2
1_V,3
1_C,4
1_C,5
1_V2,6
1_V2,7
1_B,8
1_B,9
2_P,10
2_V,11
2_V,12
2_V,13
2_C,14
2_C,15
2_C,16
3_V,17
3_V,18
3_C,19
3_C,20
3_B,21
3_B,22
`;

function initConfig() {
    const lines = rawConfig.trim().split('\n');
    lines.forEach(line => {
        const [key, page] = line.split(',');
        if (!configData[key]) configData[key] = [];
        configData[key].push(page);
    });
}
initConfig();

let wakeLock = null;

// 請求螢幕不休眠
async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('Wake Lock is active!');
        }
    } catch (err) {
        console.error(`${err.name}, ${err.message}`);
    }
}

// 終極大法：無聲音訊鎖 (防止 iOS 休眠)
function startSilentAudio() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        // 建立一個極其微弱的增益節點
        const gain = ctx.createGain();
        gain.gain.value = 0.001; 
        gain.connect(ctx.destination);

        // 每 15 秒重新啟動一次無聲震盪，防止被系統自動回收
        setInterval(() => {
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1, ctx.currentTime); // 1Hz 根本聽不到
            osc.connect(gain);
            osc.start();
            osc.stop(ctx.currentTime + 1);
        }, 15000);
    } catch (e) {
        console.log("Audio logic failed:", e);
    }
}

// 監聽回網頁時重新取得鎖定
document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible') {
        await requestWakeLock();
    }
});

// 選擇角色
async function selectRole(role) {
    currentRole = role;
    roleSelection.classList.remove('active');
    
    // 1. 嘗試標準 Wake Lock
    requestWakeLock();

    // 2. 暴力破解：播放隱形影片與畫布動畫防止休眠
    const video = document.getElementById('no-sleep-video');
    if (video) {
        const startVideo = () => {
            video.play().catch(err => console.log("Video play failed:", err));
        };
        startVideo();
        // 增加全域點擊監聽，只要點畫面就嘗試再次播放影片 (防止被瀏覽器阻擋)
        document.body.addEventListener('click', startVideo, { once: false });
    }

    startCanvasKeepAlive();
    startSilentAudio();
    startPhysicalKeepAlive(); // 啟動物理誘騙
    setInterval(requestWakeLock, 20000);

    // 進入全螢幕
    try {
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen();
        } else if (document.documentElement.webkitRequestFullscreen) {
            document.documentElement.webkitRequestFullscreen();
        }
    } catch (e) {}

    if (role === 'controller') {
        controllerScreen.classList.add('active');
    } else {
        displayScreen.classList.add('active');
        document.body.classList.add('display-mode');
    }
}

// 歌曲切換
function setSong(num) {
    currentSong = num;
    updateSongUI();
    socket.emit('change-song', num);
}

function updateSongUI() {
    const title = document.querySelector('#controller-screen h1');
    if (title) title.innerText = `主唱控制面板 (第 ${currentSong} 首)`;
    
    const songTag = document.getElementById('display-song-tag');
    if (songTag) songTag.innerText = `第 ${currentSong} 首`;

    // 更新主唱端按鈕樣式 (如果有的話)
    document.querySelectorAll('.song-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`btn-song-${currentSong}`);
    if (activeBtn) activeBtn.classList.add('active');

    // 不論是否有段落，都發送一次狀態更新以同步標題
    const map = { 'verse': 'V', 'verse2': 'V2', 'pre-chorus': 'P', 'chorus': 'C', 'bridge': 'B', 'outro': 'O' };
    const key = `${currentSong}_${map[activePart] || 'V'}`;
    const pages = configData[key] || [];
    
    const data = { 
        activePart: activePart || 'clear', 
        color: (activePart && activePart !== 'clear') ? document.body.style.backgroundColor : '#333',
        text: (activePart && activePart !== 'clear') ? currentPartText.textContent.split(' [')[0] : '等待中...',
        song: currentSong,
        page: pages[0] || ''
    };
    applyState(data);
}

// 監聽鍵盤快捷鍵 (Ctrl+1, 2, 3)
window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && ['1', '2', '3'].includes(e.key)) {
        e.preventDefault();
        setSong(parseInt(e.key));
    }
});

function goBack() {
    location.reload();
}

// --- 核心顯示與指示燈控制 ---
function toggleIndicator(mode) {
    const indicator = document.getElementById('ahk-repeat-toggle');
    if (!indicator) return;

    if (mode === 'clear') {
        indicator.style.backgroundColor = '#FFFFFF';
        return;
    }

    // 模式 1: 新段落 (變綠色)
    if (mode === 'new') {
        indicator.style.backgroundColor = '#00FF00'; 
    } 
    // 模式 2: 反覆 (變紫色)
    else if (mode === 'repeat') {
        indicator.style.backgroundColor = '#FF00FF';
    }

    // 0.5 秒後變回白色，製造「閃爍」效果供 AHK 捕捉
    setTimeout(() => {
        indicator.style.backgroundColor = '#FFFFFF';
    }, 500);
}

function triggerRepeatFeedback() {
    const activeBtn = document.querySelector('.part-btn.active-part');
    if (!activeBtn) return;
    activeBtn.classList.remove('pulsing');
    void activeBtn.offsetWidth;
    activeBtn.classList.add('pulsing');
}

function triggerRepeatDisplay() {
    const ring  = document.getElementById('repeat-ring');
    const badge = document.getElementById('repeat-badge');
    if (!ring || !badge) return;
    ring.classList.remove('do-ring');
    badge.classList.remove('do-badge');
    void ring.offsetWidth; 
    ring.classList.add('do-ring');
    badge.classList.add('do-badge');
}

function applyState(data) {
    if (!data || !data.color) return;
    
    // 1. 更新背景色
    if (document.body.classList.contains('display-mode')) {
        document.body.style.backgroundColor = data.color;
    }
    
    // 2. 更新文字
    currentPartText.textContent = data.text;

    // 3. 處理指示燈與動畫
    const map = { 'verse': 'V', 'verse2': 'V2', 'pre-chorus': 'P', 'chorus': 'C', 'bridge': 'B', 'outro': 'O' };
    const cmd = `${data.song}_${map[data.activePart] || 'WAIT'}`;

    if (data.activePart === 'clear') {
        toggleIndicator('clear');
        const ring = document.getElementById('repeat-ring');
        const badge = document.getElementById('repeat-badge');
        if (ring) ring.classList.remove('do-ring');
        if (badge) badge.classList.remove('do-badge');
        document.title = `[CMD:${cmd}] 等待中... - 同步歌詞`;
    } else {
        if (data.activePart !== activePart) {
            const ring = document.getElementById('repeat-ring');
            const badge = document.getElementById('repeat-badge');
            if (ring) ring.classList.remove('do-ring');
            if (badge) badge.classList.remove('do-badge');
        }
        document.title = `[CMD:${cmd}] 同步歌詞`;
    }

    activePart = data.activePart;

    // 4. 更新按鈕樣式
    document.querySelectorAll('.part-btn').forEach(btn => btn.classList.remove('active-part'));
    if (activePart && activePart !== 'clear') {
        const btn = document.querySelector(`.part-btn.${activePart}`);
        if (btn) btn.classList.add('active-part');
    }
}

// 主選單控制：新點擊 vs 反覆
function changePart(partCode, color, text) {
    if (partCode === 'clear') {
        const data = { activePart: 'clear', color: '#333333', text: '等待中...', page: '', song: currentSong };
        socket.emit('change-part', data);
        applyState(data);
        return;
    }

    if (partCode === activePart) {
        socket.emit('repeat');
        triggerRepeatFeedback();
    } else {
        const map = { 'verse': 'V', 'verse2': 'V2', 'pre-chorus': 'P', 'chorus': 'C', 'bridge': 'B', 'outro': 'O' };
        const key = `${currentSong}_${map[partCode] || 'V'}`;
        const pages = configData[key] || [];
        const firstPage = pages[0] || '';

        const data = { 
            activePart: partCode, 
            color: color, 
            text: text, 
            song: currentSong,
            page: firstPage
        };
        socket.emit('change-part', data);
        applyState(data);
        // toggleIndicator('new'); // 新段落改由大背景變色偵測，小方塊專心處理「反覆」
    }
}

// --- 接收伺服器訊號 ---
socket.on('state-update', (data) => {
    applyState(data);
});

socket.on('song-update', (num) => {
    currentSong = num;
    updateSongUI();
});

socket.on('repeat', () => {
    toggleIndicator('repeat');
    triggerRepeatDisplay();
});

// --- 畫布防休眠核心邏輯 ---
function startCanvasKeepAlive() {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.pointerEvents = 'none';
    canvas.style.opacity = '0.01';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    setInterval(() => {
        ctx.fillStyle = `rgb(${Math.random()*255},${Math.random()*255},${Math.random()*255})`;
        ctx.fillRect(0, 0, 1, 1);
    }, 1000);
}

// --- 物理動態誘騙核心邏輯 ---
function startPhysicalKeepAlive() {
    const dot = document.createElement('div');
    dot.style.cssText = 'position:fixed; bottom:0; left:0; width:1px; height:1px; background:white; opacity:0.01; z-index:9999; pointer-events:none;';
    document.body.appendChild(dot);

    setInterval(() => {
        // 每秒變更透明度與位置 (物理位移誘騙)
        dot.style.left = dot.style.left === '0px' ? '1px' : '0px';
        document.body.style.opacity = document.body.style.opacity === '0.99' ? '1.0' : '0.99';
    }, 1000);
}

// --- 鍵盤熱鍵監聽 ---
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && ['1', '2', '3'].includes(e.key)) {
        e.preventDefault(); // 防止瀏覽器切換分頁
        setSong(parseInt(e.key));
    }
});

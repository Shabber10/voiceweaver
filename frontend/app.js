document.addEventListener('DOMContentLoaded', () => {
    const textInput = document.getElementById('text-input');
    const downloadBtn = document.getElementById('download-btn');
    const charCount = document.getElementById('count');
    const statusMsg = document.getElementById('status-message');
    const audioPlayer = document.getElementById('audio-player');
    
    // Core Controls
    const skipBack30Btn = document.getElementById('skip-back-30-btn');
    const skipBackBtn = document.getElementById('skip-back-btn');
    const pausePlayBtn = document.getElementById('pause-play-btn');
    const skipForward10Btn = document.getElementById('skip-forward-10-btn');
    const skipForwardBtn = document.getElementById('skip-forward-btn');
    const loopBtn = document.getElementById('loop-btn');
    
    // Icons
    const pauseIcon = document.getElementById('pause-icon');
    const playIcon = document.getElementById('play-icon');
    
    // Settings & Utils
    const settingsContainer = document.querySelector('.settings-container');
    const settingsBtn = document.getElementById('settings-btn');
    const settingsPopover = document.getElementById('settings-popover');
    
    const volumeSlider = document.getElementById('volume-slider');
    const volDown = document.getElementById('vol-down');
    const volUp = document.getElementById('vol-up');
    
    const speedSlider = document.getElementById('speed-slider');
    const speedDown = document.getElementById('speed-down');
    const speedUp = document.getElementById('speed-up');
    const speedLabel = document.getElementById('speed-label');
    
    // Timeline
    const progressSlider = document.getElementById('progress-slider');
    const currentTimeEl = document.getElementById('current-time');
    const totalTimeEl = document.getElementById('total-time');

    // UI Modes
    const textMode = document.getElementById('text-mode');
    const imageMode = document.getElementById('image-mode');
    const uploadBtn = document.getElementById('upload-image-btn');
    const imageInput = document.getElementById('image-input');
    const uploadedImg = document.getElementById('uploaded-image');
    const highlightCanvas = document.getElementById('highlight-canvas');
    const closeImageBtn = document.getElementById('close-image-btn');
    const ocrLoader = document.getElementById('ocr-loader');
    
    // Voice Loader Elements
    const voiceLoader = document.getElementById('voice-loader');
    const loadPercent = document.getElementById('load-percent');
    const ringProgress = document.getElementById('ring-progress');

    let isGenerated = false;
    let isImageMode = false;
    let ocrResult = null; // Stores Tesseract result { words: [...] }
    let wordTimings = []; // Stores backend timings [{ word, offset, duration }]
    
    // Speculative Generation State
    let preGeneratedAudio = null;
    let preGeneratedTimings = [];
    let preGeneratedText = "";
    let isPreGenerating = false;
    let pendingPlay = false; // Flag if user clicked play while pre-gen was in progress
    let debounceTimer = null;

    // --- Core UI Logic ---

    textInput.addEventListener('input', () => {
        charCount.textContent = textInput.value.length;
        resetPlaybackState();
        
        // Speculative trigger
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const text = textInput.value.trim();
            if (text.length > 5 && text !== preGeneratedText) {
                startPreGeneration(text);
            }
        }, 800);
    });

    const resetPlaybackState = () => {
        if (isGenerated || isPreGenerating || preGeneratedAudio) {
            isGenerated = false;
            
            // Manage memory for Blob URLs
            if (preGeneratedAudio && preGeneratedAudio.startsWith('blob:')) {
                URL.revokeObjectURL(preGeneratedAudio);
            }
            
            preGeneratedAudio = null;
            preGeneratedTimings = [];
            preGeneratedText = "";
            pendingPlay = false;
            
            audioPlayer.pause();
            audioPlayer.removeAttribute('src');
            audioPlayer.load(); // Reset player state
            
            pauseIcon.style.display = 'none';
            playIcon.style.display = 'block';
            
            progressSlider.value = 0;
            currentTimeEl.textContent = '0:00';
            totalTimeEl.textContent = '0:00';
            
            setMediaControlsState(true);
            wordTimings = [];
            clearHighlight();
        }
    };

    const setStatus = (msg, type) => {
        statusMsg.textContent = msg;
        statusMsg.className = `status-message show ${type}`;
    };

    const clearStatus = () => {
        statusMsg.className = 'status-message';
    };

    const setButtonsState = (disabled) => {
        pausePlayBtn.disabled = disabled;
        downloadBtn.disabled = disabled;
        uploadBtn.disabled = disabled;
        if (disabled) {
            pausePlayBtn.classList.add('loading-pulse');
            downloadBtn.classList.add('loading-pulse');
        } else {
            pausePlayBtn.classList.remove('loading-pulse');
            downloadBtn.classList.remove('loading-pulse');
        }
    };

    const setMediaControlsState = (disabled) => {
        skipBack30Btn.disabled = disabled;
        skipBackBtn.disabled = disabled;
        skipForward10Btn.disabled = disabled;
        skipForwardBtn.disabled = disabled;
        settingsBtn.disabled = disabled;
    };

    // --- OCR & Image Handling ---

    uploadBtn.addEventListener('click', () => imageInput.click());

    imageInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            uploadedImg.src = event.target.result;
            switchToImageMode();
            
            // Run OCR
            try {
                ocrLoader.classList.remove('hidden');
                setStatus('Initializing OCR engine...', 'loading');
                
                // Multilingual support: English + Hindi + Telugu
                const worker = await Tesseract.createWorker(['eng', 'hin', 'tel']);
                setStatus('Extracting text from image...', 'loading');
                const result = await worker.recognize(event.target.result);
                ocrResult = result.data;
                await worker.terminate();
                
                if (ocrResult.text.trim().length === 0) {
                    throw new Error('No text found in the image.');
                }

                setStatus('Text extracted successfully.', 'success');
                resetPlaybackState(); // Clear any previous audio
                
                // Immediate speculative trigger for OCR mode
                startPreGeneration(ocrResult.text);
            } catch (error) {
                setStatus(`OCR Error: ${error.message}`, 'error');
                switchToTextMode();
            } finally {
                ocrLoader.classList.add('hidden');
            }
        };
        reader.readAsDataURL(file);
    });

    const ttsCard = document.querySelector('.tts-card');
    const zoomTarget = document.getElementById('zoom-target');
    let scale = 1;
    let translateX = 0;
    let translateY = 0;
    let isPanning = false;
    let startX, startY;

    const updateZoomTransform = () => {
        zoomTarget.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    };

    // Zoom event
    zoomTarget.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomSpeed = 0.1;
        const delta = e.deltaY > 0 ? -zoomSpeed : zoomSpeed;
        const newScale = Math.min(Math.max(0.5, scale + delta), 5);
        
        // Zoom toward cursor (simplified)
        scale = newScale;
        updateZoomTransform();
    }, { passive: false });

    // Pan events
    zoomTarget.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; // Left click only
        isPanning = true;
        startX = e.clientX - translateX;
        startY = e.clientY - translateY;
        zoomTarget.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
        if (!isPanning) return;
        translateX = e.clientX - startX;
        translateY = e.clientY - startY;
        updateZoomTransform();
    });

    window.addEventListener('mouseup', () => {
        isPanning = false;
        zoomTarget.style.cursor = 'grab';
    });

    const switchToImageMode = () => {
        isImageMode = true;
        textMode.classList.add('hidden');
        imageMode.classList.remove('hidden');
        ttsCard.classList.add('image-mode-active');
        uploadBtn.classList.add('active');
        
        // Reset zoom
        scale = 1;
        translateX = 0;
        translateY = 0;
        updateZoomTransform();
        resetPlaybackState();
    };

    const switchToTextMode = () => {
        isImageMode = false;
        textMode.classList.remove('hidden');
        imageMode.classList.add('hidden');
        ttsCard.classList.remove('image-mode-active');
        uploadBtn.classList.remove('active');
        ocrResult = null;
        imageInput.value = '';
        resetPlaybackState();
        clearHighlight();
    };

    closeImageBtn.addEventListener('click', switchToTextMode);

    // Determine API Base URL dynamically for local vs Remote (Render)
    const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? 'http://localhost:3000' 
        : 'https://voiceweaver-backend.onrender.com'; // Replace this with your actual Render URL later!

    const fetchTTS = async (text) => {
        const response = await fetch(`${API_BASE}/api/tts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || 'Failed to generate speech');
        }

        return response.blob();
    };

    const fetchTTSWithTimings = async (text) => {
        const response = await fetch(`${API_BASE}/api/tts-with-timings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || 'Failed to generate speech');
        }

        return response.json();
    };

    let progressInterval = null;
    let currentSimProgress = 0;

    const updateVoiceLoader = (percent) => {
        const p = Math.min(100, Math.max(0, percent));
        loadPercent.textContent = `${Math.round(p)}%`;
        const offset = 339.292 - (339.292 * p / 100);
        ringProgress.style.strokeDashoffset = offset;
    };

    const startProgressSimulation = () => {
        if (progressInterval) clearInterval(progressInterval);
        currentSimProgress = 0;
        updateVoiceLoader(0);
        voiceLoader.classList.remove('hidden');
        
        progressInterval = setInterval(() => {
            if (currentSimProgress < 98) {
                // Smooth incremental progress
                const inc = Math.random() * 1.5 + 0.2; 
                currentSimProgress += inc;
                updateVoiceLoader(currentSimProgress);
            }
        }, 60);
    };

    const startPreGeneration = async (text) => {
        const normalizedText = text.trim().replace(/\s+/g, ' ');
        if (isPreGenerating || normalizedText === preGeneratedText) {
            // If already generating but user clicks play, start the UI simulation
            if (pendingPlay && !progressInterval) {
                startProgressSimulation();
            }
            return;
        }
        
        try {
            isPreGenerating = true;
            preGeneratedText = normalizedText;
            setStatus('Optimizing your voice...', 'loading');
            
            // Start progress simulation if user is already waiting
            if (pendingPlay) {
                startProgressSimulation();
            }
            
            if (isImageMode) {
                const data = await fetchTTSWithTimings(normalizedText);
                preGeneratedAudio = `data:audio/mpeg;base64,${data.audioBase64}`;
                preGeneratedTimings = data.timings;
            } else {
                const blob = await fetchTTS(normalizedText);
                preGeneratedAudio = URL.createObjectURL(blob);
            }
            
            if (!pendingPlay) {
                setStatus('Ready to play.', 'success');
            }
            
            // If user was waiting for this, start playing now
            if (pendingPlay) {
                clearInterval(progressInterval);
                progressInterval = null;
                updateVoiceLoader(100);
                setTimeout(() => {
                    pendingPlay = false;
                    startFinalPlayback();
                }, 300);
            }
        } catch (error) {
            console.error('Pre-gen error:', error);
            isPreGenerating = false;
            preGeneratedText = "";
            clearInterval(progressInterval);
            progressInterval = null;
            voiceLoader.classList.add('hidden');
        } finally {
            isPreGenerating = false;
        }
    };

    const startFinalPlayback = () => {
        if (!preGeneratedAudio) return;
        
        try {
            audioPlayer.src = preGeneratedAudio;
            audioPlayer.load(); // Force browser to re-read the new src
            
            if (isImageMode) {
                wordTimings = preGeneratedTimings;
            }
            
            isGenerated = true;
            audioPlayer.play().catch(e => {
                console.error("Playback failed:", e);
                setStatus("Click 'Play' again to start.", "error");
            });
            setStatus('Playing...', 'success');
            setButtonsState(false);
            voiceLoader.classList.add('hidden');
        } catch (err) {
            console.error("Playback initialization error:", err);
            setStatus("Ready to play.", "success");
            setButtonsState(false);
            voiceLoader.classList.add('hidden');
        }
    };

    // --- Highlighting Logic ---

    const clearHighlight = () => {
        const ctx = highlightCanvas.getContext('2d');
        ctx.clearRect(0, 0, highlightCanvas.width, highlightCanvas.height);
    };

    const drawHighlight = (wordIndex) => {
        if (!ocrResult || !ocrResult.words[wordIndex]) return;
        
        const word = ocrResult.words[wordIndex];
        const ctx = highlightCanvas.getContext('2d');
        
        // Match canvas size to displayed image size
        const displayWidth = uploadedImg.clientWidth;
        const displayHeight = uploadedImg.clientHeight;
        const naturalWidth = uploadedImg.naturalWidth;
        const naturalHeight = uploadedImg.naturalHeight;
        
        highlightCanvas.width = displayWidth;
        highlightCanvas.height = displayHeight;
        
        const scaleX = displayWidth / naturalWidth;
        const scaleY = displayHeight / naturalHeight;
        
        const box = word.bbox; // {x0, y0, x1, y1}
        
        clearHighlight();
        
        // Simple glowing highlight
        ctx.fillStyle = 'rgba(6, 182, 212, 0.3)'; // Primary accent with transparency
        ctx.strokeStyle = 'rgba(6, 182, 212, 0.8)';
        ctx.lineWidth = 2;
        
        const x = box.x0 * scaleX;
        const y = box.y0 * scaleY;
        const w = (box.x1 - box.x0) * scaleX;
        const h = (box.y1 - box.y0) * scaleY;
        
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
    };

    // --- Audio Logic ---

    pausePlayBtn.addEventListener('click', async () => {
        if (!isGenerated) {
            const rawText = isImageMode ? (ocrResult ? ocrResult.text : "") : textInput.value.trim();
            const text = rawText.trim().replace(/\s+/g, ' ');
            
            if (!text) {
                setStatus('Please enter text or upload an image.', 'error');
                return;
            }

            // CASE 1: Audio is already pre-generated and matches text
            if (preGeneratedAudio && text === preGeneratedText) {
                startFinalPlayback();
                return;
            }

            // CASE 2: Generation is currently in progress
            if (isPreGenerating && text === preGeneratedText) {
                pendingPlay = true;
                setStatus('Optimizing your voice...', 'loading');
                setButtonsState(true);
                
                // Show the central loader and start simulation
                startProgressSimulation();
                return;
            }

            // CASE 3: Fresh generation needed
            try {
                pendingPlay = true; // Mark that we are waiting for this generation
                setButtonsState(true);
                setStatus('Optimizing your voice...', 'loading');
                
                // Show loader and start simulation immediately
                startProgressSimulation();
                
                await startPreGeneration(text);
                // Note: startFinalPlayback is called inside startPreGeneration if pendingPlay is true
            } catch (error) {
                setStatus(`Error: ${error.message}`, 'error');
                setButtonsState(false);
            }
        } else {
            if (audioPlayer.paused) {
                audioPlayer.play();
            } else {
                audioPlayer.pause();
            }
        }
    });

    audioPlayer.addEventListener('timeupdate', () => {
        const currentTimeMs = audioPlayer.currentTime * 1000;
        progressSlider.value = audioPlayer.currentTime;
        currentTimeEl.textContent = formatTime(audioPlayer.currentTime);

        if (isImageMode && wordTimings.length > 0) {
            // Find the current word based on audio time
            const currentWordIndex = wordTimings.findIndex(t => 
                currentTimeMs >= t.offset && currentTimeMs <= (t.offset + t.duration + 100)
            );
            
            if (currentWordIndex !== -1) {
                drawHighlight(currentWordIndex);
            } else {
                // If we are between words or offset is slightly off, we might want to keep the last highlight
                // or clear it. Let's keep it until a new one appears or audio ends.
            }
        }
    });

    // Reset highlight on end/pause
    audioPlayer.addEventListener('ended', () => {
        clearHighlight();
    });
    audioPlayer.addEventListener('pause', () => {
        // We might want to keep the highlight when paused for better UX
    });

    // --- Existing Controls ---

    const formatTime = (time) => {
        if (isNaN(time) || !isFinite(time)) return "0:00";
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    };

    audioPlayer.addEventListener('loadedmetadata', () => {
        progressSlider.max = audioPlayer.duration;
        totalTimeEl.textContent = formatTime(audioPlayer.duration);
    });

    progressSlider.addEventListener('input', () => {
        audioPlayer.currentTime = progressSlider.value;
    });

    audioPlayer.addEventListener('play', () => {
        if (isGenerated) {
            pauseIcon.style.display = 'block';
            playIcon.style.display = 'none';
        }
        setMediaControlsState(false);
    });

    audioPlayer.addEventListener('pause', () => {
        if (isGenerated) {
            pauseIcon.style.display = 'none';
            playIcon.style.display = 'block';
        }
    });

    // ... rest of the buttons logic (skips, loop, speed, volume, download) ...
    // Note: To keep the file brief, I'll assume the rest of the button handlers are similar to before.
    
    skipBack30Btn.addEventListener('click', () => audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime - 30));
    skipBackBtn.addEventListener('click', () => audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime - 10));
    skipForward10Btn.addEventListener('click', () => audioPlayer.currentTime = Math.min(audioPlayer.duration, audioPlayer.currentTime + 10));
    skipForwardBtn.addEventListener('click', () => audioPlayer.currentTime = Math.min(audioPlayer.duration, audioPlayer.currentTime + 30));
    loopBtn.addEventListener('click', () => {
        audioPlayer.loop = !audioPlayer.loop;
        loopBtn.classList.toggle('active', audioPlayer.loop);
    });
    volumeSlider.addEventListener('input', (e) => audioPlayer.volume = e.target.value);
    volDown.addEventListener('click', () => { volumeSlider.value = Math.max(0, volumeSlider.value - 0.05); audioPlayer.volume = volumeSlider.value; });
    volUp.addEventListener('click', () => { volumeSlider.value = Math.min(1, parseFloat(volumeSlider.value) + 0.05); audioPlayer.volume = volumeSlider.value; });
    speedSlider.addEventListener('input', (e) => { audioPlayer.playbackRate = e.target.value; speedLabel.textContent = parseFloat(e.target.value).toFixed(2) + 'x'; });
    speedDown.addEventListener('click', () => { speedSlider.value = Math.max(0.25, speedSlider.value - 0.25); audioPlayer.playbackRate = speedSlider.value; speedLabel.textContent = parseFloat(speedSlider.value).toFixed(2) + 'x'; });
    speedUp.addEventListener('click', () => { speedSlider.value = Math.min(2, parseFloat(speedSlider.value) + 0.25); audioPlayer.playbackRate = speedSlider.value; speedLabel.textContent = parseFloat(speedSlider.value).toFixed(2) + 'x'; });
    settingsBtn.addEventListener('click', (e) => { e.stopPropagation(); settingsPopover.classList.toggle('hidden'); });
    document.addEventListener('click', (e) => { if (!settingsContainer.contains(e.target)) settingsPopover.classList.add('hidden'); });

    downloadBtn.addEventListener('click', async () => {
        let text = "";
        if (isImageMode) { if (!ocrResult) return; text = ocrResult.text; } else { text = textInput.value.trim(); }
        if (!text) return;
        try {
            setButtonsState(true);
            setStatus('Preparing download...', 'loading');
            const blob = await fetchTTS(text);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'voiceweaver_speech.mp3';
            a.click();
            setStatus('Download started.', 'success');
        } catch (error) { setStatus(`Error: ${error.message}`, 'error'); } finally { setButtonsState(false); }
    });

    // Initialize UI
    setMediaControlsState(true);
    pausePlayBtn.disabled = false;
});

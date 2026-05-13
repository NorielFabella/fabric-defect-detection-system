import { ObjectDetector, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";

// Elements
const videoElement = document.getElementById('video');
const canvasElement = document.getElementById('canvas');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');

let mediaStream = null;
let objectDetector = null;

async function initializeMediaPipe() {
    try {
        const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
        );

        objectDetector = await ObjectDetector.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: 'detectorv3.tflite',
                delegate: 'GPU'
            },
            runningMode: 'VIDEO',
            maxResults: 5,
            scoreThreshold: 0.5
        });

        console.log('Detector loaded successfully!');
    } catch (error) {
        console.error('Error initializing MediaPipe models:', error);
        alert('Failed to load AI model. Open the console for details.');
    }
}

function initializeCanvas() {
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;
}

async function startCamera() {
    try {
        const constraints = {
            video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        };

        mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        videoElement.srcObject = mediaStream;

        videoElement.onloadedmetadata = () => {
            videoElement.play();
            initializeCanvas();
            startProcessing();
        };

        window.addEventListener('resize', initializeCanvas);
        startBtn.disabled = true;
        stopBtn.disabled = false;

        console.log('Camera started successfully');
    } catch (error) {
        console.error('Error accessing camera:', error);
        alert('Unable to access camera. Please check permissions and try again.');
        startBtn.disabled = false;
        stopBtn.disabled = true;
    }
}

function stopCamera() {
    stopProcessing();

    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        videoElement.srcObject = null;
        mediaStream = null;
    }

    startBtn.disabled = false;
    stopBtn.disabled = true;
    console.log('Camera stopped');
}

const ctx = canvasElement.getContext('2d');
let animationFrameId = null;

function processVideoFrame(timestamp) {
    ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    if (videoElement.readyState !== videoElement.HAVE_ENOUGH_DATA) {
        animationFrameId = requestAnimationFrame(processVideoFrame);
        return;
    }

    try {
        const detections = objectDetector.detectForVideo(videoElement, timestamp);

        if (detections.detections && detections.detections.length > 0) {
            for (const detection of detections.detections) {
                const bbox = detection.boundingBox;

                const startX = bbox.originX;
                const startY = bbox.originY;
                const width = bbox.width;
                const height = bbox.height;

                // Plain bounding box only
                ctx.strokeStyle = '#00ff00';
                ctx.lineWidth = 3;
                ctx.strokeRect(startX, startY, width, height);
            }
        } else {
            const text = "No defects detected";
            ctx.font = "bold 24px Arial";
            ctx.fillStyle = "#00ff00";

            ctx.shadowColor = "black";
            ctx.shadowBlur = 4;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 2;

            const textWidth = ctx.measureText(text).width;
            ctx.fillText(text, (canvasElement.width / 2) - (textWidth / 2), 40);

            ctx.shadowColor = "transparent";
        }
    } catch (error) {
        console.error('Error processing frame:', error);
    }

    animationFrameId = requestAnimationFrame(processVideoFrame);
}

function startProcessing() {
    if (!animationFrameId) {
        animationFrameId = requestAnimationFrame(processVideoFrame);
    }
}

function stopProcessing() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
}

startBtn.addEventListener('click', startCamera);
stopBtn.addEventListener('click', stopCamera);
stopBtn.disabled = true;

initializeMediaPipe();
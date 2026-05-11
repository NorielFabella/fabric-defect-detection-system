import { ObjectDetector, ImageClassifier, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";

// Elements
const videoElement = document.getElementById('video');
const canvasElement = document.getElementById('canvas');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');

let mediaStream = null;
let objectDetector = null;
let imageClassifier = null;

// Initialize MediaPipe Vision Tasks
async function initializeMediaPipe() {
    try {
        const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
        );

        // Create ObjectDetector
        objectDetector = await ObjectDetector.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: 'detectorv3.tflite',
                delegate: 'GPU' 
            },
            runningMode: 'VIDEO',
            maxResults: 5,
            scoreThreshold: 0.3
        });

        // Create ImageClassifier
        // FIXED: Set runningMode to 'IMAGE' since we feed it a static cropped canvas
        imageClassifier = await ImageClassifier.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: 'classifierv5.tflite',
                delegate: 'GPU' 
            },
            runningMode: 'IMAGE', 
            maxResults: 3,
            scoreThreshold: 0.3
        });

        console.log('MediaPipe models loaded successfully!');
    } catch (error) {
        console.error('Error initializing MediaPipe models:', error);
        alert('Failed to load AI models. Open the console (F12) for details.');
    }
}

// Initialize canvas size to match the camera's true resolution
function initializeCanvas() {
    // Instead of using the CSS bounding box, use the intrinsic video feed size
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;
}

// Request camera access with rear-facing preference
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
const offscreenCanvas = document.createElement('canvas');
const offscreenCtx = offscreenCanvas.getContext('2d');

let animationFrameId = null;

// Main processing loop
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

                offscreenCanvas.width = width;
                offscreenCanvas.height = height;

                offscreenCtx.drawImage(
                    videoElement,
                    startX, startY, width, height,
                    0, 0, width, height
                );

                // FIXED: API syntax for Image mode classification
                const classification = imageClassifier.classify(offscreenCanvas);

                if (classification.classifications && classification.classifications.length > 0) {
                    const categories = classification.classifications[0].categories;

                    if (categories.length > 0) {
                        const topCategory = categories[0];
                        const label = topCategory.categoryName;
                        const confidence = topCategory.score;

                        if (label.toLowerCase() !== 'defect_free') {
                            let boxColor = '#ff0000'; 
                            if (confidence >= 0.8) {
                                boxColor = '#00ff00'; 
                            } else if (confidence >= 0.5) {
                                boxColor = '#ffa500'; 
                            }

                            ctx.strokeStyle = boxColor;
                            ctx.lineWidth = 3;
                            ctx.strokeRect(startX, startY, width, height);

                            const labelText = `${label} (${(confidence * 100).toFixed(1)}%)`;
                            const fontSize = 14;
                            ctx.font = `bold ${fontSize}px Arial`;
                            const textWidth = ctx.measureText(labelText).width;
                            const textHeight = fontSize + 4;

                            ctx.fillStyle = boxColor;
                            ctx.fillRect(
                                startX,
                                startY - textHeight - 5,
                                textWidth + 8,
                                textHeight + 4
                            );

                            ctx.fillStyle = '#000000';
                            ctx.fillText(labelText, startX + 4, startY - 8);
                        }
                    }
                }
            }
        }
        else {
            // NEW: If no defects are found, draw the green text
            const text = "No defects detected";
            ctx.font = "bold 24px Arial";
            ctx.fillStyle = "#00ff00"; // Bright Green
            
            // Draw a subtle black shadow so it's readable on light fabric
            ctx.shadowColor = "black";
            ctx.shadowBlur = 4;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 2;
            
            // Put text at the top center of the screen
            const textWidth = ctx.measureText(text).width;
            ctx.fillText(text, (canvasElement.width / 2) - (textWidth / 2), 40);
            
            // Reset shadow so it doesn't affect bounding boxes later
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

// Initialize automatically
initializeMediaPipe();
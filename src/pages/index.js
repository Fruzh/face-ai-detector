import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import face-api.js to avoid SSR issues
const faceapi = typeof window !== 'undefined' ? require('face-api.js') : null;

function Home() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [infoWajah, setInfoWajah] = useState(null);
  const [error, setError] = useState(null);
  const [lastDetection, setLastDetection] = useState(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [isCameraStarted, setIsCameraStarted] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    if (videoRef.current && canvasRef.current) {
      console.log('Video and canvas elements mounted');
      setIsMounted(true);
    }
  }, []);

  useEffect(() => {
    const loadModels = async () => {
      if (!faceapi) {
        console.error('face-api.js is not available');
        setError('face-api.js tidak tersedia');
        return;
      }
      try {
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri('/models/ssd_mobilenetv1'),
          faceapi.nets.faceLandmark68Net.loadFromUri('/models/face_landmark_68'),
          faceapi.nets.faceExpressionNet.loadFromUri('/models/face_expression'),
          faceapi.nets.ageGenderNet.loadFromUri('/models/age_gender_model'),
        ]);
        console.log('Models loaded successfully');
        setIsLoading(false);
      } catch (err) {
        console.error('Error loading models:', err);
        setError('Gagal memuat model: ' + err.message);
      }
    };
    loadModels();
  }, []);

  const startVideo = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const errMsg = 'Kamera tidak didukung oleh browser ini atau aplikasi tidak berjalan di HTTPS/localhost';
      console.error(errMsg);
      setError(errMsg);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play().catch(err => {
            console.error('Error playing video:', err);
            setError('Gagal memainkan video: ' + err.message);
          });
          console.log('Video started, resolution:', videoRef.current?.videoWidth || 'unknown', 'x', videoRef.current?.videoHeight || 'unknown');
          setIsVideoReady(true);
          setError(null);
        };
      } else {
        console.error('videoRef.current is null in startVideo');
        setError('Video element tidak tersedia');
      }
    } catch (err) {
      console.error('Error accessing camera:', err);
      let errMsg = 'Gagal mengakses kamera: ' + err.message;
      if (err.name === 'NotAllowedError') {
        errMsg = 'Izin kamera ditolak. Harap izinkan akses kamera di pengaturan browser.';
      } else if (err.name === 'NotFoundError') {
        errMsg = 'Tidak ada kamera yang ditemukan di perangkat ini.';
      }
      setError(errMsg);
    }
  };

  useEffect(() => {
    if (!faceapi || !isVideoReady || !isMounted) {
      console.log('Detection not started: prerequisites not met', {
        faceapi: !!faceapi,
        isVideoReady,
        isMounted,
      });
      return;
    }

    let intervalId;

    const detectFace = async () => {
      if (!videoRef.current || !canvasRef.current) {
        console.log('Skipping detection: video or canvas ref is null');
        return;
      }
      if (videoRef.current.readyState !== 4) {
        console.log('Skipping detection: video not playable, readyState:', videoRef.current.readyState);
        return;
      }

      try {
        const options = new faceapi.SsdMobilenetv1Options({
          minConfidence: 0.2,
        });
        const detections = await faceapi
          .detectAllFaces(videoRef.current, options)
          .withFaceLandmarks()
          .withAgeAndGender()
          .withFaceExpressions();

        const dims = faceapi.matchDimensions(canvasRef.current, videoRef.current, true);
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        } else {
          console.log('Canvas context is null');
          return;
        }

        const detection = detections.sort((a, b) => b.detection.score - a.detection.score)[0];

        if (detection) {
          console.log('Face detected, confidence:', detection.detection.score);
          setLastDetection({ ...detection, timestamp: Date.now() });
          const resized = faceapi.resizeResults(detection, dims);
          faceapi.draw.drawDetections(canvasRef.current, resized);
          faceapi.draw.drawFaceLandmarks(canvasRef.current, resized);

          const ekspresiDominan = Object.entries(detection.expressions)
            .sort((a, b) => b[1] - a[1])[0][0];

          setInfoWajah({
            umur: detection.age.toFixed(1),
            gender: detection.gender,
            emosi: ekspresiDominan,
          });
          setError(null);
        } else {
          console.log('No face detected');
          if (lastDetection && Date.now() - lastDetection.timestamp < 1000) {
            const resized = faceapi.resizeResults(lastDetection, dims);
            faceapi.draw.drawDetections(canvasRef.current, resized);
            faceapi.draw.drawFaceLandmarks(canvasRef.current, resized);
            setInfoWajah({
              umur: lastDetection.age.toFixed(1),
              gender: lastDetection.gender,
              emosi: Object.entries(lastDetection.expressions).sort((a, b) => b[1] - a[1])[0][0],
            });
          } else {
            setInfoWajah(null);
          }
        }
      } catch (err) {
        console.error('Error during face detection:', err);
        setError('Error deteksi wajah: ' + err.message);
      }
    };

    intervalId = setInterval(detectFace, 33);
    console.log('Started detection interval');

    return () => {
      console.log('Cleaning up detection interval');
      clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faceapi, isVideoReady, isMounted]);

  return (
    <main className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
      <h1 className="text-3xl font-bold mb-6 text-center">Deteksi Wajah AI</h1>

      <div className="mt-8 flex flex-col md:flex-row md:items-start md:gap-8 w-full max-w-6xl">
        <div className="relative w-full md:w-2/3 aspect-video bg-gray-800 rounded-xl shadow-lg overflow-hidden border-2 border-gray-700">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            autoPlay
            muted
            style={{ display: isCameraStarted ? 'block' : 'none' }}
          />
          <canvas
            ref={canvasRef}
            className="absolute top-0 left-0 w-full h-full"
            style={{ display: isCameraStarted ? 'block' : 'none' }}
          />

          {!isCameraStarted && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
              <button
                onClick={() => {
                  setIsCameraStarted(true);
                  startVideo();
                }}
                className="bg-blue-500 text-white px-6 py-3 rounded-lg shadow hover:bg-blue-600 transition"
              >
                Mulai Kamera
              </button>
            </div>
          )}
        </div>

        <div className="mt-6 md:mt-0 md:w-1/3 bg-gray-800 rounded-xl p-6 text-center shadow-md space-y-4 min-h-[180px] flex flex-col justify-center">
          {error ? (
            <p className="text-red-400 text-lg">{error}</p>
          ) : isLoading ? (
            <p className="text-yellow-400 text-lg">Memuat model AI wajah...</p>
          ) : infoWajah ? (
            <>
              <p className="text-lg">
                <strong>Umur:</strong> {infoWajah.umur} tahun
              </p>
              <p className="text-lg">
                <strong>Jenis Kelamin:</strong> {infoWajah.gender === 'male' ? 'Laki-laki' : 'Perempuan'}
              </p>
              <p className="text-lg">
                <strong>Ekspresi:</strong> {infoWajah.emosi}
              </p>
            </>
          ) : (
            <p className="text-gray-400 italic text-lg">Tidak ada wajah terdeteksi.</p>
          )}
        </div>
      </div>
    </main>
  );
}

export default dynamic(() => Promise.resolve(Home), { ssr: false });
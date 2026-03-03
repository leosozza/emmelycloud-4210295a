import { useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Camera, RotateCcw } from "lucide-react";

interface SelfieCaptureProps {
  onCaptureChange: (dataUrl: string | null) => void;
}

export function SelfieCapture({ onCaptureChange }: SelfieCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [captured, setCaptured] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startCamera = useCallback(async () => {
    try {
      setError(null);
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch {
      setError("Não foi possível aceder à câmera. Verifique as permissões.");
    }
  }, []);

  const capture = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(videoRef.current, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    setCaptured(dataUrl);
    onCaptureChange(dataUrl);
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
  };

  const reset = () => {
    setCaptured(null);
    onCaptureChange(null);
    startCamera();
  };

  if (error) {
    return (
      <div className="text-center space-y-3 py-8">
        <p className="text-sm text-destructive">{error}</p>
        <Button onClick={startCamera} variant="outline" size="sm">Tentar novamente</Button>
      </div>
    );
  }

  if (captured) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Selfie capturada como prova de identidade:</p>
        <img src={captured} alt="Selfie" className="w-full max-w-sm mx-auto rounded-lg border" />
        <Button type="button" variant="outline" size="sm" onClick={reset}>
          <RotateCcw className="mr-2 h-4 w-4" /> Tirar outra
        </Button>
      </div>
    );
  }

  if (!stream) {
    return (
      <div className="text-center space-y-3 py-8">
        <p className="text-sm text-muted-foreground">Tire uma selfie para comprovar a sua identidade.</p>
        <Button onClick={startCamera} variant="outline">
          <Camera className="mr-2 h-4 w-4" /> Abrir Câmera
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Posicione o rosto e clique em capturar:</p>
      <video ref={videoRef} autoPlay playsInline muted className="w-full max-w-sm mx-auto rounded-lg border" />
      <Button type="button" onClick={capture}>
        <Camera className="mr-2 h-4 w-4" /> Capturar
      </Button>
    </div>
  );
}

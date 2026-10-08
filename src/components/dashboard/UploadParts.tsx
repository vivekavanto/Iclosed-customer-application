"use client";

// Shared pieces of the task upload boxes.
import { useRef, useState } from "react";
import Webcam from "react-webcam";
import { Camera, X } from "lucide-react";

async function dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
  const blob = await fetch(dataUrl).then((r) => r.blob());
  return new File([blob], filename, { type: "image/jpeg" });
}

/** Camera capture returning a JPEG file. */
export function PhotoCaptureDialog({
  title,
  onCapture,
  onClose,
}: {
  title: string;
  onCapture: (file: File) => void;
  onClose: () => void;
}) {
  const webcamRef = useRef<Webcam>(null);
  const [shot, setShot] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  async function acceptPhoto() {
    // e.g. "Photo - Home insurance binder.jpg".
    if (shot) onCapture(await dataUrlToFile(shot, `Photo - ${title.replace(/[\\/:*?"<>|]+/g, "")}.jpg`));
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 px-4" role="dialog" aria-modal="true" aria-label="Take photo">
      <div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-gray-900">{title}</p>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-md p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100"
            aria-label="Close camera"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-gray-950">
          {shot ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shot} alt="Captured photo" className="absolute inset-0 h-full w-full object-contain" />
          ) : (
            <Webcam
              ref={webcamRef}
              audio={false}
              screenshotFormat="image/jpeg"
              screenshotQuality={0.95}
              forceScreenshotSourceSize
              videoConstraints={{ facingMode: "environment", width: { ideal: 1920 } }}
              onUserMediaError={() => setCameraError("Unable to access camera. Please allow camera permissions.")}
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
        </div>
        {cameraError && <p className="text-xs text-[#C10007]">{cameraError}</p>}
        <div className="flex gap-3">
          {shot ? (
            <>
              <button
                type="button"
                onClick={() => setShot(null)}
                className="cursor-pointer flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Retake
              </button>
              <button
                type="button"
                onClick={acceptPhoto}
                className="cursor-pointer flex-1 rounded-lg bg-[#C10007] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#a30006]"
              >
                Use photo
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={!!cameraError}
              onClick={() => setShot(webcamRef.current?.getScreenshot() ?? null)}
              className="cursor-pointer flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-[#C10007] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#a30006] disabled:opacity-60"
            >
              <Camera size={15} /> Capture
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// "✓ name  Remove" for an uploaded file.
export function FileDoneLine({ name, action, onAction }: { name: string; action: string; onAction: () => void }) {
  return (
    <p className="flex min-w-0 max-w-full items-baseline justify-center gap-3">
      <span className="min-w-0 truncate text-sm font-semibold text-green-700">&#10003; {name}</span>
      <button
        type="button"
        onClick={onAction}
        className="cursor-pointer shrink-0 text-xs text-gray-400 hover:text-[#C10007]"
      >
        {action}
      </button>
    </p>
  );
}

/** Hides .jpeg when .jpg is listed. */
export function acceptLabel(accept: string): string {
  const types = accept.split(",").map((t) => t.trim()).filter(Boolean);
  return types.filter((t) => t !== ".jpeg" || !types.includes(".jpg")).join(", ");
}

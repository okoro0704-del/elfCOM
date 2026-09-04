/**
 * Request mic/camera before WebRTC so Android shows runtime permission sheets.
 */
export async function ensureCallPermissions(video: boolean): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("Media devices unavailable on this device");
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: video ? { facingMode: "user" } : false,
  });
  for (const track of stream.getTracks()) track.stop();
}

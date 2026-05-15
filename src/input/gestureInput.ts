import { Vec2, Vec3, distance2, normalize3, rotateAroundAxis, vec2, vec3 } from "../knot/curve";

export interface GestureInput {
  start: () => Promise<void>;
  stop: () => void;
}

export type HandSide = "left" | "right";
export type HandGesture = "none" | "open-palm" | "pinch" | "fist";
export type HandConfidence = "none" | "low" | "high";

export interface HandSignal {
  side: HandSide;
  present: boolean;
  confidence: number;
  confidenceLevel: HandConfidence;
  gesture: HandGesture;
}

export interface HandTrackingStatus {
  available: boolean;
  running: boolean;
  message: string;
  left: HandSignal;
  right: HandSignal;
}

export interface RightHandCursor {
  point: Vec2;
  confidence: number;
  confidenceLevel: HandConfidence;
  visible: boolean;
}

interface GestureInputOptions {
  video: HTMLVideoElement;
  diagramCanvas: HTMLCanvasElement;
  getProjectionNormal: () => Vec3;
  onProjectionNormal: (normal: Vec3) => void;
  onProjectionCommit: (normal: Vec3) => void;
  onRightCursor: (cursor: RightHandCursor) => void;
  onRightSlashSegment: (start: Vec2, end: Vec2, trail: Vec2[]) => void;
  onRightSlashEnd: (trail: Vec2[]) => void;
  onStatus: (status: HandTrackingStatus) => void;
}

type Landmark = {
  x: number;
  y: number;
  z?: number;
};

type HandLandmarkerResult = {
  landmarks?: Landmark[][];
  handednesses?: Array<Array<{ categoryName?: string; score?: number }>>;
};

type HandLandmarker = {
  detectForVideo: (video: HTMLVideoElement, nowInMs: number) => HandLandmarkerResult;
  close?: () => void;
};

type VisionTasksModule = {
  FilesetResolver: {
    forVisionTasks: (wasmPath: string) => Promise<unknown>;
  };
  HandLandmarker: {
    createFromOptions: (vision: unknown, options: Record<string, unknown>) => Promise<HandLandmarker>;
  };
};

const confidenceThreshold = 0.65;
const cdnVersion = "0.10.22";
const emptyLeft = (): HandSignal => emptyHand("left");
const emptyRight = (): HandSignal => emptyHand("right");

export const createGestureInput = (options: GestureInputOptions): GestureInput => {
  let stopped = true;
  let frameId = 0;
  let stream: MediaStream | null = null;
  let landmarker: HandLandmarker | null = null;
  let leftManipulation: LeftManipulation | null = null;
  let rightMotion: RightMotion | null = null;
  let lastStatus: HandTrackingStatus = {
    available: false,
    running: false,
    message: "Hand Mode is off.",
    left: emptyLeft(),
    right: emptyRight()
  };

  const publishStatus = (status: Partial<HandTrackingStatus>): void => {
    lastStatus = {
      ...lastStatus,
      ...status,
      left: status.left ?? lastStatus.left,
      right: status.right ?? lastStatus.right
    };
    options.onStatus(lastStatus);
  };

  return {
    start: async () => {
      if (!stopped) {
        return;
      }
      stopped = false;
      publishStatus({
        running: false,
        message: "Loading MediaPipe Hand Landmarker..."
      });

      try {
        const visionTasks = await loadVisionTasks();
        if (!visionTasks) {
          stopped = true;
          publishStatus({
            available: false,
            running: false,
            message: "MediaPipe Hand Landmarker is unavailable.",
            left: emptyLeft(),
            right: emptyRight()
          });
          options.onRightCursor(hiddenCursor());
          return;
        }

        const vision = await visionTasks.FilesetResolver.forVisionTasks(
          `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${cdnVersion}/wasm`
        );
        landmarker = await visionTasks.HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 960 },
            height: { ideal: 540 }
          },
          audio: false
        });
        options.video.srcObject = stream;
        await options.video.play();
        publishStatus({
          available: true,
          running: true,
          message: "Hand tracking active.",
          left: emptyLeft(),
          right: emptyRight()
        });
        frameId = window.requestAnimationFrame(tick);
      } catch (error) {
        stop();
        publishStatus({
          available: false,
          running: false,
          message: error instanceof Error ? error.message : "Hand Mode could not start.",
          left: emptyLeft(),
          right: emptyRight()
        });
        options.onRightCursor(hiddenCursor());
      }
    },
    stop
  };

  function tick(): void {
    if (stopped || !landmarker) {
      return;
    }

    const result = landmarker.detectForVideo(options.video, performance.now());
    const hands = extractHands(result);
    const left = hands.left ? analyzeHand("left", hands.left.landmarks, hands.left.confidence) : emptyLeft();
    const right = hands.right ? analyzeHand("right", hands.right.landmarks, hands.right.confidence) : emptyRight();

    handleLeftHand(left, hands.left?.landmarks ?? null);
    handleRightHand(right, hands.right?.landmarks ?? null);
    publishStatus({
      available: true,
      running: true,
      message: "Hand tracking active.",
      left,
      right
    });

    frameId = window.requestAnimationFrame(tick);
  }

  function stop(): void {
    stopped = true;
    if (frameId) {
      window.cancelAnimationFrame(frameId);
      frameId = 0;
    }
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    landmarker?.close?.();
    landmarker = null;
    commitLeftManipulation(lastStatus.left.confidence);
    leftManipulation = null;
    finishRightSlash();
    options.video.pause();
    options.video.srcObject = null;
    options.onRightCursor(hiddenCursor());
    publishStatus({
      running: false,
      message: "Hand Mode is off.",
      left: emptyLeft(),
      right: emptyRight()
    });
  }

  function handleLeftHand(signal: HandSignal, landmarks: Landmark[] | null): void {
    if (!landmarks || signal.confidence < confidenceThreshold || signal.gesture === "open-palm") {
      commitLeftManipulation(signal.confidence);
      leftManipulation = null;
      return;
    }

    if (signal.gesture !== "pinch" && signal.gesture !== "fist") {
      commitLeftManipulation(signal.confidence);
      leftManipulation = null;
      return;
    }

    const center = handCenter(landmarks);
    if (!leftManipulation) {
      leftManipulation = {
        lastPoint: center,
        normal: options.getProjectionNormal(),
        dirty: false
      };
      return;
    }

    const rect = options.diagramCanvas.getBoundingClientRect();
    const radius = Math.max(1, Math.min(rect.width, rect.height) * 0.38);
    const dx = ((center.x - leftManipulation.lastPoint.x) * rect.width) / radius;
    const dy = ((center.y - leftManipulation.lastPoint.y) * rect.height) / radius;
    if (Math.abs(dx) + Math.abs(dy) > 0.002) {
      leftManipulation.normal = normalize3(rotateAroundAxis(leftManipulation.normal, vec3(0, 1, 0), dx * 1.35));
      leftManipulation.normal = normalize3(rotateAroundAxis(leftManipulation.normal, vec3(1, 0, 0), dy * 1.35));
      leftManipulation.dirty = true;
      options.onProjectionNormal(leftManipulation.normal);
    }
    leftManipulation.lastPoint = center;
  }

  function commitLeftManipulation(confidence: number): void {
    if (!leftManipulation?.dirty) {
      return;
    }
    if (confidence >= confidenceThreshold) {
      options.onProjectionCommit(leftManipulation.normal);
    }
  }

  function handleRightHand(signal: HandSignal, landmarks: Landmark[] | null): void {
    if (!landmarks) {
      finishRightSlash();
      options.onRightCursor(hiddenCursor());
      return;
    }

    const point = indexTipToDiagramPoint(landmarks[8], options.diagramCanvas);
    options.onRightCursor({
      point,
      confidence: signal.confidence,
      confidenceLevel: signal.confidenceLevel,
      visible: true
    });

    if (signal.confidence < confidenceThreshold) {
      finishRightSlash();
      rightMotion = {
        previousPoint: point,
        previousTime: performance.now(),
        trail: [],
        slashing: false
      };
      return;
    }

    const now = performance.now();
    if (!rightMotion) {
      rightMotion = {
        previousPoint: point,
        previousTime: now,
        trail: [],
        slashing: false
      };
      return;
    }

    const elapsed = Math.max(1, now - rightMotion.previousTime);
    const speed = distance2(point, rightMotion.previousPoint) / elapsed;
    const fast = speed > 0.75 && distance2(point, rightMotion.previousPoint) > 7;

    if (fast) {
      if (!rightMotion.slashing) {
        rightMotion.trail = [rightMotion.previousPoint];
        rightMotion.slashing = true;
      }
      rightMotion.trail.push(point);
      options.onRightSlashSegment(rightMotion.previousPoint, point, rightMotion.trail);
    } else if (rightMotion.slashing) {
      finishRightSlash();
    }

    rightMotion.previousPoint = point;
    rightMotion.previousTime = now;
  }

  function finishRightSlash(): void {
    if (rightMotion?.slashing) {
      options.onRightSlashEnd(rightMotion.trail);
    }
    rightMotion = null;
  }
};

interface LeftManipulation {
  lastPoint: Vec2;
  normal: Vec3;
  dirty: boolean;
}

interface RightMotion {
  previousPoint: Vec2;
  previousTime: number;
  trail: Vec2[];
  slashing: boolean;
}

const emptyHand = (side: HandSide): HandSignal => ({
  side,
  present: false,
  confidence: 0,
  confidenceLevel: "none",
  gesture: "none"
});

const hiddenCursor = (): RightHandCursor => ({
  point: vec2(0, 0),
  confidence: 0,
  confidenceLevel: "none",
  visible: false
});

const loadVisionTasks = async (): Promise<VisionTasksModule | null> => {
  const globalTasks = window as Window &
    Partial<{
      FilesetResolver: VisionTasksModule["FilesetResolver"];
      HandLandmarker: VisionTasksModule["HandLandmarker"];
    }>;
  if (globalTasks.FilesetResolver && globalTasks.HandLandmarker) {
    return {
      FilesetResolver: globalTasks.FilesetResolver,
      HandLandmarker: globalTasks.HandLandmarker
    };
  }

  try {
    return (await import(
      /* @vite-ignore */ `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${cdnVersion}/vision_bundle.mjs`
    )) as VisionTasksModule;
  } catch {
    return null;
  }
};

const extractHands = (
  result: HandLandmarkerResult
): Partial<Record<HandSide, { landmarks: Landmark[]; confidence: number }>> => {
  const hands: Partial<Record<HandSide, { landmarks: Landmark[]; confidence: number }>> = {};
  const landmarks = result.landmarks ?? [];
  const handednesses = result.handednesses ?? [];

  landmarks.forEach((handLandmarks, index) => {
    const category = handednesses[index]?.[0];
    const side = category?.categoryName === "Left" ? "left" : "right";
    const confidence = category?.score ?? 0;
    const existing = hands[side];
    if (!existing || confidence > existing.confidence) {
      hands[side] = {
        landmarks: handLandmarks,
        confidence
      };
    }
  });

  return hands;
};

const analyzeHand = (side: HandSide, landmarks: Landmark[], confidence: number): HandSignal => ({
  side,
  present: true,
  confidence,
  confidenceLevel: confidence >= confidenceThreshold ? "high" : "low",
  gesture: classifyGesture(landmarks)
});

const classifyGesture = (landmarks: Landmark[]): HandGesture => {
  const wrist = landmarks[0];
  const middleMcp = landmarks[9];
  const palmScale = Math.max(0.001, distance2(wrist, middleMcp));
  const pinchDistance = distance2(landmarks[4], landmarks[8]) / palmScale;
  if (pinchDistance < 0.72) {
    return "pinch";
  }

  const tipIds = [8, 12, 16, 20];
  const pipIds = [6, 10, 14, 18];
  const closedCount = tipIds.filter((tipId, index) => {
    const tipDistance = distance2(wrist, landmarks[tipId]);
    const pipDistance = distance2(wrist, landmarks[pipIds[index]]);
    return tipDistance < pipDistance * 1.12;
  }).length;

  if (closedCount >= 3) {
    return "fist";
  }

  const extendedCount = tipIds.filter((tipId, index) => {
    const tipDistance = distance2(wrist, landmarks[tipId]);
    const pipDistance = distance2(wrist, landmarks[pipIds[index]]);
    return tipDistance > pipDistance * 1.22;
  }).length;

  return extendedCount >= 3 ? "open-palm" : "none";
};

const handCenter = (landmarks: Landmark[]): Vec2 => {
  const ids = [0, 5, 9, 13, 17];
  const sum = ids.reduce((acc, id) => vec2(acc.x + landmarks[id].x, acc.y + landmarks[id].y), vec2(0, 0));
  return vec2(sum.x / ids.length, sum.y / ids.length);
};

const indexTipToDiagramPoint = (indexTip: Landmark, canvas: HTMLCanvasElement): Vec2 => {
  const rect = canvas.getBoundingClientRect();
  return vec2((1 - indexTip.x) * rect.width, indexTip.y * rect.height);
};

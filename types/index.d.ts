type LocalState = any;

interface Ad {
  adAccountId: string;
  adConfiguration: {
    days: string[];
    duration: number;
    endTime: string;
    startTime: string;
  };
  duration: number;
  endTime: string;
  startTime: string;
  adId: string;
  adType: "video" | "image" | "iframe";
  adUrl: string;
  campaignId: string;
  campaignView: number;
  uploadName: string;
  uploadRef: string;
}

interface ScreenConfig {
  city: string;
  deviceId: string;
  layout: string;
  layoutReference: string;
  screenHeight: string;
  screenId: string;
  screenLayoutConfig: { width: number };
  screenName: string;
  screenResolution: string;
  screenWidth: string;
  ttl: string;
}

interface SendLogParams {
  adId: string;
  accountId: string;
  campaignId: string;
  messageType: "play" | "skipped";
  uploadRef: string;
}

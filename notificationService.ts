import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

/**
 * 请求通知权限，返回是否已授权
 */
export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;

  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== "granted") return false;

  // Android 13+ 需要额外设置通知渠道
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("trade-plan", {
      name: "交易计划提醒",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      vibrationPattern: [0, 250, 250, 250],
    });
  }
  return true;
}

/**
 * 注册一次性本地通知
 * @param planText  计划内容（取前 50 字作预览）
 * @param triggerDate  精确触发时间（Date 对象，必须在未来）
 * @returns 通知 identifier
 */
export async function schedulePlanNotification(
  planText: string,
  triggerDate: Date,
): Promise<string> {
  // 不再全量取消，由调用方按需取消指定 id
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: "🚨 看看你的今日计划吧，要严格执行！！",
      body: planText.slice(0, 50),
      data: { planText },
      sound: "default",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
    },
  });

  return id;
}

/**
 * 取消指定 id 的通知
 */
export async function cancelNotificationById(id: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(id);
}

/**
 * 取消所有待触发的交易计划通知
 */
export async function cancelPendingPlanNotifications(): Promise<void> {
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of pending) {
    // 通过 title 识别是我们的计划通知
    if (n.content.title?.includes("集合竞价")) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
}

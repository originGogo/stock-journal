import { useEffect } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";
import MainTabNavigator from "./screens/MainTabNavigator";

// 前台通知展示行为（App 在前台时也弹窗 + 声音）
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export default function App() {
  useEffect(() => {
    // 预热通知权限（不强制，PlanScreen 会在用户主动操作时再请求）
    Notifications.getPermissionsAsync();
  }, []);

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <MainTabNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

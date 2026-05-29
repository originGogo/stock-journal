import React from "react";
import { Text } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import HomeScreen from "./HomeScreen";
import AddRecordScreen from "./AddRecordScreen";
import EditRecordScreen from "./EditRecordScreen";
import OverviewScreen from "./OverviewScreen";
import ReportScreen from "./ReportScreen";
import CalendarScreen from "./CalendarScreen";
import PlanScreen from "./PlanScreen";

// ── Tab 图标（用 emoji，无需额外图标库）────────────────────
function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return (
    <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.45 }}>{emoji}</Text>
  );
}

import { type JournalStackParamList } from "./EditRecordScreen";

// ── 日记 Stack（首页 + 添加记录）──────────────────────────
const JournalStack = createNativeStackNavigator<JournalStackParamList>();

function JournalNavigator() {
  return (
    <JournalStack.Navigator>
      <JournalStack.Screen
        name="Home"
        component={HomeScreen}
        options={{ headerShown: false }}
      />
      <JournalStack.Screen
        name="AddRecord"
        component={AddRecordScreen}
        options={{ title: "添加复盘" }}
      />
      <JournalStack.Screen
        name="EditRecord"
        component={EditRecordScreen}
        options={{ title: "编辑复盘" }}
      />
    </JournalStack.Navigator>
  );
}

// ── 底部 Tab ───────────────────────────────────────────────
const Tab = createBottomTabNavigator();

export default function MainTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#1a73e8",
        tabBarInactiveTintColor: "#999",
        tabBarStyle: {
          backgroundColor: "#fff",
          borderTopColor: "#e0e0e0",
          borderTopWidth: 0.5,
          height: 60,
          paddingBottom: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
        },
      }}
    >
      <Tab.Screen
        name="Journal"
        component={JournalNavigator}
        options={{
          tabBarLabel: "复盘日记",
          tabBarIcon: ({ focused }) => <TabIcon emoji="📖" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Calendar"
        component={CalendarScreen}
        options={{
          tabBarLabel: "日历",
          tabBarIcon: ({ focused }) => <TabIcon emoji="📅" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Overview"
        component={OverviewScreen}
        options={{
          tabBarLabel: "数据看板",
          tabBarIcon: ({ focused }) => <TabIcon emoji="📊" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Report"
        component={ReportScreen}
        options={{
          tabBarLabel: "周报",
          tabBarIcon: ({ focused }) => <TabIcon emoji="🗓️" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Plan"
        component={PlanScreen}
        options={{
          tabBarLabel: "明日计划",
          tabBarIcon: ({ focused }) => <TabIcon emoji="📋" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

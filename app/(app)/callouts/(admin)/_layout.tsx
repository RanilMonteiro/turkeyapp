import { Tabs } from 'expo-router';
import { LayoutDashboard, Plus, Calendar,Users } from 'lucide-react-native';
import { useColorScheme, Platform } from 'react-native';

const colors = {
  yellow: '#fbbf24',
  white: '#ffffff',
  black: '#000000',
  gray: {
    200: '#e2e8f0',
    400: '#94a3b8',
    500: '#64748b',
    800: '#1e293b',
    900: '#0f172a',
  }
};

export default function AdminCalloutsLayout() {
  const isDark = useColorScheme() === 'dark';

  return (
    <Tabs screenOptions={{
      headerShown: true,
      headerTitle: 'TURNKEY',
      headerStyle: {
        backgroundColor: isDark ? colors.black : colors.white,
      },
      headerTitleStyle: {
        color: isDark ? colors.yellow : colors.gray[800],
        fontWeight: 'bold',
        fontSize: 20,
      },
      headerShadowVisible: false,
      tabBarStyle: {
        backgroundColor: isDark ? colors.black : colors.white,
        borderTopColor: isDark ? colors.gray[800] : colors.gray[200],
        borderTopWidth: 1,
        height: Platform.OS === 'ios' ? 85 : 65,
        paddingBottom: Platform.OS === 'ios' ? 28 : 10,
        paddingTop: 8,
      },
      tabBarActiveTintColor: colors.yellow,
      tabBarInactiveTintColor: isDark ? colors.gray[500] : colors.gray[400],
      tabBarLabelStyle: {
        fontSize: 12,
        fontWeight: '500',
      },
    }}>
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Callouts',
          tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="new-callout"
        options={{
          title: 'New',
          tabBarIcon: ({ color, size }) => <Plus color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          tabBarIcon: ({ color, size }) => <Calendar color={color} size={size} />,
        }}
      />
      <Tabs.Screen
  name="technicians"
  options={{
    title: 'Technicians',
    tabBarIcon: ({ color, size }) => <Users color={color} size={size} />,
  }}
/>
 <Tabs.Screen
        name="callout/[id]"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
import { Tabs } from 'expo-router';
import { List, CheckCircle } from 'lucide-react-native';
import { useColorScheme } from 'react-native';

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

export default function TechnicianCalloutsLayout() {
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
        height: 60,
        paddingBottom: 8,
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
        name="jobs"
        options={{
          title: 'Available',
          tabBarIcon: ({ color, size }) => <List color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="my-jobs"
        options={{
          title: 'My Jobs',
          tabBarIcon: ({ color, size }) => <CheckCircle color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
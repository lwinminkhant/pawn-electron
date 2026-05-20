import { useTheme } from '@/components/primitives';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Tabs } from 'expo-router';
import React from 'react';

export default function TabsLayout() {
    const theme = useTheme();
    return (
        <Tabs
            screenOptions={{
                headerStyle: { backgroundColor: theme.palette.bg },
                headerTitleStyle: { color: theme.palette.text, fontWeight: '600' },
                headerShadowVisible: false,
                tabBarActiveTintColor: theme.palette.accent,
                tabBarInactiveTintColor: theme.palette.textSubtle,
                tabBarStyle: {
                    backgroundColor: theme.palette.surface,
                    borderTopColor: theme.palette.border,
                },
            }}
        >
            <Tabs.Screen
                name="index"
                options={{
                    title: 'Dashboard',
                    tabBarIcon: ({ color }) => <IconSymbol name="house.fill" size={22} color={color} />,
                }}
            />
            <Tabs.Screen
                name="pawns"
                options={{
                    title: 'Pawns',
                    tabBarIcon: ({ color }) => <IconSymbol name="list.bullet" size={22} color={color} />,
                }}
            />
            <Tabs.Screen
                name="customers"
                options={{
                    title: 'Customers',
                    href: null,
                    tabBarIcon: ({ color }) => <IconSymbol name="person.2.fill" size={22} color={color} />,
                }}
            />
            <Tabs.Screen
                name="reports"
                options={{
                    title: 'Reports',
                    href: null,
                    tabBarIcon: ({ color }) => <IconSymbol name="chart.bar.fill" size={22} color={color} />,
                }}
            />
            <Tabs.Screen
                name="settings"
                options={{
                    title: 'Settings',
                    tabBarIcon: ({ color }) => <IconSymbol name="gearshape.fill" size={22} color={color} />,
                }}
            />
        </Tabs>
    );
}

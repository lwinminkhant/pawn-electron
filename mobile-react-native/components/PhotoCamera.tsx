import React, { useRef, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Button, Txt, useTheme } from '@/components/primitives';

type PhotoCameraProps = {
    visible: boolean;
    facing?: 'front' | 'back';
    title?: string;
    onCancel: () => void;
    onCapture: (photoBase64: string) => void;
};

export default function PhotoCamera({
    visible,
    facing = 'back',
    title = 'Take Photo',
    onCancel,
    onCapture,
}: PhotoCameraProps) {
    const theme = useTheme();
    const [permission, requestPermission] = useCameraPermissions();
    const cameraRef = useRef<CameraView>(null);
    const [capturing, setCapturing] = useState(false);

    if (!visible) return null;

    if (!permission) {
        return <View />;
    }

    if (!permission.granted) {
        return (
            <Modal visible={visible} animationType="slide">
                <View style={[styles.permissionScreen, { backgroundColor: theme.palette.bg }]}>
                    <Txt style={{ marginBottom: 16 }}>We need camera permission.</Txt>
                    <View style={{ gap: 12, width: '100%', maxWidth: 260 }}>
                        <Button onPress={() => void requestPermission()} label="Grant permission" fullWidth />
                        <Button onPress={onCancel} label="Cancel" variant="ghost" fullWidth />
                    </View>
                </View>
            </Modal>
        );
    }

    const takePicture = async () => {
        if (!cameraRef.current || capturing) return;
        setCapturing(true);
        try {
            const photo = await cameraRef.current.takePictureAsync({
                base64: true,
                quality: 0.5,
            });

            if (!photo?.base64) {
                throw new Error('Failed to capture image');
            }

            onCapture(`data:image/jpeg;base64,${photo.base64}`);
        } finally {
            setCapturing(false);
        }
    };

    return (
        <Modal visible={visible} animationType="slide">
            <View style={styles.container}>
                <CameraView
                    ref={cameraRef}
                    style={styles.camera}
                    facing={facing}
                    animateShutter={false}
                >
                    <View style={styles.overlay}>
                        <View style={styles.topBar}>
                            <Txt style={styles.title}>{title}</Txt>
                            <TouchableOpacity onPress={onCancel} style={styles.closeBtn}>
                                <Txt style={{ color: 'white' }}>Cancel</Txt>
                            </TouchableOpacity>
                        </View>
                        <View style={styles.bottomBar}>
                            <TouchableOpacity
                                style={[styles.captureBtn, capturing && { opacity: 0.5 }]}
                                onPress={takePicture}
                                disabled={capturing}
                            >
                                {capturing ? (
                                    <ActivityIndicator color="black" />
                                ) : (
                                    <View style={styles.innerCaptureBtn} />
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </CameraView>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    permissionScreen: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    container: {
        flex: 1,
    },
    camera: {
        flex: 1,
    },
    overlay: {
        flex: 1,
        justifyContent: 'space-between',
        backgroundColor: 'transparent',
    },
    topBar: {
        paddingTop: 50,
        paddingHorizontal: 20,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    title: {
        color: 'white',
        fontSize: 16,
        fontWeight: '600',
    },
    closeBtn: {
        padding: 10,
        backgroundColor: 'rgba(0,0,0,0.5)',
        borderRadius: 8,
    },
    bottomBar: {
        paddingBottom: 50,
        alignItems: 'center',
    },
    captureBtn: {
        width: 70,
        height: 70,
        borderRadius: 35,
        backgroundColor: 'white',
        justifyContent: 'center',
        alignItems: 'center',
    },
    innerCaptureBtn: {
        width: 60,
        height: 60,
        borderRadius: 30,
        borderWidth: 2,
        borderColor: 'black',
    },
});

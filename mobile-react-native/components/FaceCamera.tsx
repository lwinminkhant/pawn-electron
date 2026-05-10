import React, { useState, useRef } from 'react';
import { View, StyleSheet, Modal, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Button, Txt, useTheme } from '@/components/primitives';
import { api } from '@/lib/api';

interface FaceCameraProps {
    onMatch: (photoBase64: string, descriptor: string, matchedCustomer: any | null) => void;
    onCancel: () => void;
    visible: boolean;
}

export default function FaceCamera({ onMatch, onCancel, visible }: FaceCameraProps) {
    const theme = useTheme();
    const [permission, requestPermission] = useCameraPermissions();
    const cameraRef = useRef<CameraView>(null);
    const [processing, setProcessing] = useState(false);

    if (!visible) return null;

    if (!permission) {
        return <View />;
    }

    if (!permission.granted) {
        return (
            <Modal visible={visible} animationType="slide">
                <View style={[styles.container, { backgroundColor: theme.palette.bg, justifyContent: 'center', alignItems: 'center' }]}>
                    <Txt style={{ marginBottom: 16 }}>We need your permission to show the camera</Txt>
                    <Button onPress={requestPermission} label="Grant permission" />
                    <Button onPress={onCancel} label="Cancel" variant="ghost" style={{ marginTop: 16 }} />
                </View>
            </Modal>
        );
    }

    const takePicture = async () => {
        if (!cameraRef.current || processing) return;
        setProcessing(true);
        try {
            const photo = await cameraRef.current.takePictureAsync({
                base64: true,
                quality: 0.5,
            });
            
            if (!photo || !photo.base64) {
                throw new Error("Failed to capture image");
            }

            // Hit our new backend detect-and-search endpoint
            const res = await api.client.post('/faces/detect-and-search', {
                image: `data:image/jpeg;base64,${photo.base64}`
            });

            if (!res.data.success) {
                Alert.alert("Face Search Failed", res.data.message || "No face found");
                setProcessing(false);
                return;
            }

            const match = res.data.matches && res.data.matches.length > 0 ? res.data.matches[0] : null;
            onMatch(`data:image/jpeg;base64,${photo.base64}`, res.data.descriptor, match);
        } catch (error: any) {
            console.error('Camera capture error', error);
            Alert.alert("Error", "Could not connect to Face Search API");
        } finally {
            setProcessing(false);
        }
    };

    return (
        <Modal visible={visible} animationType="slide">
            <View style={styles.container}>
                <CameraView 
                    ref={cameraRef} 
                    style={styles.camera} 
                    facing="front"
                    animateShutter={false}
                >
                    <View style={styles.overlay}>
                        <View style={styles.topBar}>
                            <TouchableOpacity onPress={onCancel} style={styles.closeBtn}>
                                <Txt style={{ color: 'white' }}>Cancel</Txt>
                            </TouchableOpacity>
                        </View>
                        <View style={styles.bottomBar}>
                            <TouchableOpacity 
                                style={[styles.captureBtn, processing && { opacity: 0.5 }]} 
                                onPress={takePicture}
                                disabled={processing}
                            >
                                {processing ? (
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
    container: {
        flex: 1,
    },
    camera: {
        flex: 1,
    },
    overlay: {
        flex: 1,
        backgroundColor: 'transparent',
        justifyContent: 'space-between',
    },
    topBar: {
        paddingTop: 50,
        paddingHorizontal: 20,
        alignItems: 'flex-start',
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
    }
});

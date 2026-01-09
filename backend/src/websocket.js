import { WebSocketServer, WebSocket } from 'ws';

class WebSocketManager {
    constructor() {
        this.wss = null;
        this.devices = new Map(); // deviceId -> { ws, info }
    }

    initialize(server) {
        this.wss = new WebSocketServer({ server, path: '/ws' });

        this.wss.on('connection', (ws, req) => {
            console.log('🔌 New WebSocket connection');

            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    this.handleMessage(ws, message);
                } catch (error) {
                    console.error('❌ WebSocket message error:', error);
                }
            });

            ws.on('close', () => {
                this.handleDisconnect(ws);
            });

            ws.on('error', (error) => {
                console.error('❌ WebSocket error:', error);
            });
        });

        console.log('✅ WebSocket server initialized');
    }

    handleMessage(ws, message) {
        const { type, payload } = message;
        console.log(`📨 Received WebSocket message: ${type}`);

        switch (type) {
            case 'REGISTER_DEVICE':
                this.registerDevice(ws, payload);
                break;

            case 'GET_DEVICES':
                this.sendDeviceList(ws);
                break;

            case 'PLAYBACK_STATE':
                this.broadcastPlaybackState(payload);
                break;

            case 'CONTROL_DEVICE':
                this.controlDevice(payload);
                break;

            case 'TRANSFER_PLAYBACK':
                this.transferPlayback(payload);
                break;

            default:
                console.warn('⚠️ Unknown message type:', type);
        }
    }

    registerDevice(ws, deviceInfo) {
        const { deviceId, deviceName, deviceType, userId } = deviceInfo;

        // Store device connection
        this.devices.set(deviceId, {
            ws,
            deviceId,
            deviceName,
            deviceType,
            userId,
            connectedAt: Date.now(),
            isPlaying: false,
            currentTrack: null,
            controlledBy: null,
            controlling: null
        });

        console.log(`📱 Device registered: ${deviceName} (${deviceType})`);

        // Send confirmation
        this.send(ws, {
            type: 'REGISTERED',
            payload: { deviceId }
        });

        // Find if any other device of this user is currently playing
        const playingDevice = Array.from(this.devices.values()).find(
            d => d.userId === userId && d.isPlaying && d.deviceId !== deviceId
        );

        // If another device is playing, immediately send its state to the new device
        if (playingDevice && playingDevice.currentTrack) {
            console.log(`🔄 Sending current playback state to new device from ${playingDevice.deviceName}`);
            this.send(ws, {
                type: 'PLAYBACK_UPDATE',
                payload: {
                    sourceDeviceId: playingDevice.deviceId,
                    isPlaying: playingDevice.isPlaying,
                    currentTrack: playingDevice.currentTrack,
                    currentTime: playingDevice.currentTime || 0,
                    duration: playingDevice.duration || 0,
                    volume: playingDevice.volume || 0.5,
                    queue: playingDevice.queue || [],
                    currentIndex: playingDevice.currentIndex || 0,
                    isShuffled: playingDevice.isShuffled || false,
                    repeatMode: playingDevice.repeatMode || 'off'
                }
            });
        }

        // Broadcast updated device list to all devices of this user
        this.broadcastDeviceList(userId);
    }

    handleDisconnect(ws) {
        // Find and remove disconnected device
        for (const [deviceId, device] of this.devices.entries()) {
            if (device.ws === ws) {
                console.log(`📴 Device disconnected: ${device.deviceName}`);
                const userId = device.userId;
                this.devices.delete(deviceId);
                
                // Notify other devices
                this.broadcastDeviceList(userId);
                break;
            }
        }
    }

    sendDeviceList(ws) {
        const device = this.getDeviceByWs(ws);
        if (!device) return;

        const devices = this.getDevicesForUser(device.userId);
        this.send(ws, {
            type: 'DEVICE_LIST',
            payload: { devices }
        });
    }

    broadcastDeviceList(userId) {
        const devices = this.getDevicesForUser(userId);
        const userDevices = Array.from(this.devices.values())
            .filter(d => d.userId === userId);

        userDevices.forEach(device => {
            this.send(device.ws, {
                type: 'DEVICE_LIST',
                payload: { devices }
            });
        });
    }

    broadcastPlaybackState(state) {
        const { deviceId, userId, ...playbackState } = state;

        console.log(`📡 Received playback state from device ${deviceId} (userId: ${userId}):`, {
            isPlaying: playbackState.isPlaying,
            track: playbackState.currentTrack?.title
        });

        // Update device state
        const device = this.devices.get(deviceId);
        if (device) {
            device.isPlaying = playbackState.isPlaying;
            device.currentTrack = playbackState.currentTrack;
            device.currentTime = playbackState.currentTime;
            device.duration = playbackState.duration;
            device.volume = playbackState.volume;
            device.queue = playbackState.queue;
            device.currentIndex = playbackState.currentIndex;
            device.isShuffled = playbackState.isShuffled;
            device.repeatMode = playbackState.repeatMode;
        } else {
            console.warn(`⚠️ Device ${deviceId} not found in registry`);
        }

        // Broadcast to all user's devices except the sender
        const userDevices = Array.from(this.devices.values())
            .filter(d => d.userId === userId && d.deviceId !== deviceId);

        console.log(`📤 Broadcasting to ${userDevices.length} other device(s)`);

        userDevices.forEach(targetDevice => {
            console.log(`  → Sending to ${targetDevice.deviceName} (${targetDevice.deviceId})`);
            console.log(`     WebSocket state: ${targetDevice.ws.readyState} (1 = OPEN)`);
            const message = {
                type: 'PLAYBACK_UPDATE',
                payload: {
                    sourceDeviceId: deviceId,
                    ...playbackState
                }
            };
            console.log(`     Message:`, JSON.stringify(message).substring(0, 100));
            this.send(targetDevice.ws, message);
        });
    }

    controlDevice(payload) {
        const { targetDeviceId, controllerDeviceId, action, data } = payload;

        const targetDevice = this.devices.get(targetDeviceId);
        const controllerDevice = this.devices.get(controllerDeviceId);

        if (!targetDevice || !controllerDevice) {
            console.warn('⚠️ Device not found for control');
            return;
        }

        // Update control relationship
        if (action === 'START_CONTROL') {
            targetDevice.controlledBy = controllerDeviceId;
            controllerDevice.controlling = targetDeviceId;
            
            // Send confirmation to controller
            this.send(controllerDevice.ws, {
                type: 'CONTROL_STARTED',
                payload: {
                    targetDeviceId,
                    targetDeviceName: targetDevice.deviceName,
                    currentTrack: targetDevice.currentTrack,
                    isPlaying: targetDevice.isPlaying
                }
            });
        } else if (action === 'STOP_CONTROL') {
            targetDevice.controlledBy = null;
            controllerDevice.controlling = null;
        } else {
            // Send control command to target device
            this.send(targetDevice.ws, {
                type: 'CONTROL_COMMAND',
                payload: {
                    controllerDeviceId,
                    action,
                    data
                }
            });
        }
    }

    transferPlayback(payload) {
        const { fromDeviceId, toDeviceId, playbackState } = payload;

        const toDevice = this.devices.get(toDeviceId);
        if (!toDevice) {
            console.warn('⚠️ Target device not found for transfer');
            return;
        }

        // Send transfer command to target device
        this.send(toDevice.ws, {
            type: 'PLAYBACK_TRANSFER',
            payload: {
                fromDeviceId,
                ...playbackState
            }
        });

        // Notify source device to stop
        const fromDevice = this.devices.get(fromDeviceId);
        if (fromDevice) {
            this.send(fromDevice.ws, {
                type: 'PLAYBACK_TRANSFERRED',
                payload: { toDeviceId }
            });
        }
    }

    getDevicesForUser(userId) {
        return Array.from(this.devices.values())
            .filter(d => d.userId === userId)
            .map(d => ({
                deviceId: d.deviceId,
                deviceName: d.deviceName,
                deviceType: d.deviceType,
                isPlaying: d.isPlaying,
                currentTrack: d.currentTrack,
                controlledBy: d.controlledBy,
                controlling: d.controlling
            }));
    }

    getDeviceByWs(ws) {
        for (const device of this.devices.values()) {
            if (device.ws === ws) {
                return device;
            }
        }
        return null;
    }

    send(ws, message) {
        if (ws.readyState === WebSocket.OPEN) {
            const jsonMessage = JSON.stringify(message);
            ws.send(jsonMessage);
            console.log(`     ✅ Message sent (${jsonMessage.length} bytes)`);
        } else {
            console.warn(`     ⚠️ Cannot send - WebSocket not open (state: ${ws.readyState})`);
        }
    }
}

export default new WebSocketManager();


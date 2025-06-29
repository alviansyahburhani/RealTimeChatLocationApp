import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, View, Text, TouchableOpacity, Modal, Alert, TextInput, FlatList, Platform, ActivityIndicator, Keyboard
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { io } from 'socket.io-client';

// PENTING: Ganti dengan IP Address lokal Anda yang benar saat menjalankan server
const SERVER_URL = 'http://192.168.116.82:3001'; 

export default function App() {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [locations, setLocations] = useState({});
  const [isSharing, setIsSharing] = useState(false);
  const [selectedMapMessage, setSelectedMapMessage] = useState(null);
  const [isPreviewingLocation, setIsPreviewingLocation] = useState(false);
  const [currentPreviewLocation, setCurrentPreviewLocation] = useState(null);
  
  // State untuk mengontrol padding bawah secara manual di Android
  const [bottomPadding, setBottomPadding] = useState(0);

  const socketRef = useRef(null);
  const locationWatcherRef = useRef(null);
  const myLocationBubbleIdRef = useRef(null);

  useEffect(() => {
    // Listener keyboard manual untuk Android
    const onKeyboardDidShow = (e) => {
      setBottomPadding(e.endCoordinates.height);
    };

    const onKeyboardDidHide = () => {
      setBottomPadding(0);
    };

    if (Platform.OS === 'android') {
      const keyboardDidShowListener = Keyboard.addListener('keyboardDidShow', onKeyboardDidShow);
      const keyboardDidHideListener = Keyboard.addListener('keyboardDidHide', onKeyboardDidHide);

      // Hapus listener saat komponen tidak lagi digunakan untuk mencegah kebocoran memori
      return () => {
        keyboardDidShowListener.remove();
        keyboardDidHideListener.remove();
      };
    }
  }, []);

  useEffect(() => {
    const socket = io(SERVER_URL);
    socketRef.current = socket;
    socket.on('connect', () => console.log('Terhubung ke server dengan ID:', socket.id));
    socket.on('initialUsers', (users) => setLocations(users));
    socket.on('userJoined', (user) => setLocations((prev) => ({ ...prev, [user.id]: user })));
    socket.on('locationUpdate', (data) => setLocations((prev) => ({ ...prev, [data.id]: data })));
    socket.on('userDisconnected', (id) => {
      setLocations((prev) => {
        const newLocs = { ...prev };
        delete newLocs[id];
        return newLocs;
      });
    });
    socket.on('newChatMessage', (msg) => {
      setMessages((prev) => [...prev, msg]);
    });
    socket.on('locationShareEnded', ({ msgId }) => {
      setMessages(prevMessages =>
        prevMessages.map(msg =>
          msg.id === msgId ? { ...msg, isEnded: true, endTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) } : msg
        )
      );
    });
    return () => socket.disconnect();
  }, []);

  const handleInitiateLocationShare = () => {
    setIsPreviewingLocation(true);
  };

  const confirmAndSendLocation = async () => {
    if (!currentPreviewLocation) {
      Alert.alert('Gagal', 'Lokasi belum ditemukan, coba lagi.');
      return;
    }
    const locationMessage = {
      id: Date.now(), type: 'location', username: socketRef.current.id, latitude: currentPreviewLocation.latitude, longitude: currentPreviewLocation.longitude, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), isEnded: false,
    };
    myLocationBubbleIdRef.current = locationMessage.id;
    socketRef.current?.emit('chatMessage', locationMessage);
    locationWatcherRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 10 },
      (loc) => {
        socketRef.current?.emit('locationUpdate', loc.coords);
      }
    );
    setIsSharing(true);
    setIsPreviewingLocation(false);
    setCurrentPreviewLocation(null);
  };

  const stopSharingLocation = () => {
    setIsSharing(false);
    if (locationWatcherRef.current) {
      locationWatcherRef.current.remove();
    }
    if (myLocationBubbleIdRef.current) {
      socketRef.current?.emit('sharingStopped', { msgId: myLocationBubbleIdRef.current });
    }
  };
  
  const LocationPreviewModal = () => {
    useEffect(() => {
      const findMyLocation = async () => {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Izin Ditolak', 'Izin lokasi dibutuhkan untuk memilih lokasi.');
          setIsPreviewingLocation(false); return;
        }
        const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        setCurrentPreviewLocation(location.coords);
      };
      if (isPreviewingLocation) { findMyLocation(); }
    }, [isPreviewingLocation]);
    return (
      <Modal visible={isPreviewingLocation} animationType="slide" onRequestClose={() => setIsPreviewingLocation(false)}>
        <View style={{ flex: 1 }}>
          {currentPreviewLocation ? (
            <MapView style={StyleSheet.absoluteFill} initialRegion={{ latitude: currentPreviewLocation.latitude, longitude: currentPreviewLocation.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01, }}>
              <Marker coordinate={currentPreviewLocation} title="Lokasi Anda" />
            </MapView>
          ) : ( <View style={styles.centered}><ActivityIndicator size="large" /><Text>Mencari lokasi Anda...</Text></View> )}
          <TouchableOpacity onPress={() => setIsPreviewingLocation(false)} style={styles.cancelButton}><Text style={styles.buttonText}>Batal</Text></TouchableOpacity>
          <TouchableOpacity onPress={confirmAndSendLocation} style={styles.sendPreviewButton}><Text style={styles.buttonText}>Kirim Lokasi Saat Ini</Text></TouchableOpacity>
        </View>
      </Modal>
    );
  };
  
  const sendTextMessage = () => {
    if (text.trim() === '') return;
    const message = { id: Date.now(), type: 'text', username: socketRef.current.id, text: text, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), };
    socketRef.current?.emit('chatMessage', message);
    setText('');
  };
  
  const renderMessageItem = ({ item }) => {
    const isMyMessage = item.username === socketRef.current?.id;
    if (item.type === 'text') {
      return (
        <View style={[styles.messageBubble, isMyMessage ? styles.myMessage : styles.theirMessage]}>
          <Text style={styles.usernameText}>{isMyMessage ? 'Anda' : `User ${item.username.substring(0, 5)}`}</Text>
          <Text style={styles.messageText}>{item.text}</Text>
          <Text style={styles.timeText}>{item.time}</Text>
        </View>
      );
    }
    if (item.type === 'location') {
      return (
        <TouchableOpacity onPress={() => setSelectedMapMessage(item)} style={[styles.locationContainer, isMyMessage ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start' }]}>
            <Text style={styles.locationUsername}>{isMyMessage ? 'Anda' : `User ${item.username.substring(0, 5)}`} membagikan lokasi</Text>
            <MapView style={styles.locationMapBubble} scrollEnabled={false} zoomEnabled={false} region={{ latitude: item.latitude, longitude: item.longitude, latitudeDelta: 0.005, longitudeDelta: 0.005, }}>
                <Marker coordinate={{ latitude: item.latitude, longitude: item.longitude }} />
            </MapView>
            <Text style={styles.timeText}>{item.time}</Text>
        </TouchableOpacity>
      );
    }
    return null;
  };
  
  return (
    <View style={[styles.container, Platform.OS === 'android' && { paddingBottom: bottomPadding }]}>
      
      <FlatList
        data={messages}
        renderItem={renderMessageItem}
        keyExtractor={(item) => item.id.toString()}
        style={styles.messageList}
      />
      
      <View style={styles.inputContainer}>
        <TouchableOpacity onPress={isSharing ? stopSharingLocation : handleInitiateLocationShare} style={[styles.locationButton, isSharing && {backgroundColor: '#d9534f'}]} >
          <Text style={styles.buttonText}>{isSharing ? 'Stop' : 'Lokasi'}</Text>
        </TouchableOpacity>
        <TextInput style={styles.textInput} placeholder="Ketik pesan..." value={text} onChangeText={setText} />
        <TouchableOpacity onPress={sendTextMessage} style={styles.sendButton}><Text style={styles.buttonText}>Kirim</Text></TouchableOpacity>
      </View>

      <LocationPreviewModal />

      <Modal visible={!!selectedMapMessage} animationType="slide" onRequestClose={() => setSelectedMapMessage(null)}>
        <View style={{ flex: 1 }}>
          <MapView style={StyleSheet.absoluteFill} initialRegion={{ latitude: selectedMapMessage?.latitude || 0, longitude: selectedMapMessage?.longitude || 0, latitudeDelta: 0.0922, longitudeDelta: 0.0421, }}>
            {selectedMapMessage?.isEnded ? (
              <Marker coordinate={{ latitude: selectedMapMessage.latitude, longitude: selectedMapMessage.longitude }} title="Lokasi Terakhir" />
            ) : (
              Object.values(locations).map(loc => loc.latitude && ( <Marker key={loc.id} coordinate={{ latitude: loc.latitude, longitude: loc.longitude }} title={loc.id === socketRef.current?.id ? 'Lokasi Anda' : `User ${loc.id.substring(0,5)}`} pinColor={loc.id === socketRef.current?.id ? 'blue' : 'red'} /> ))
            )}
          </MapView>
          
          <TouchableOpacity onPress={() => setSelectedMapMessage(null)} style={styles.closeButton}>
            <Text style={styles.buttonText}>Tutup Peta</Text>
          </TouchableOpacity>

          {selectedMapMessage?.isEnded && (
            <View style={styles.endedBanner}>
              <Text style={styles.endedBannerTitle}>Lokasi terkini berakhir</Text>
              <Text style={styles.endedBannerSubtitle}>
                Terakhir diperbarui hari ini pukul {selectedMapMessage.endTime || selectedMapMessage.time}
              </Text>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f0f0f0' },
    messageList: { flex: 1, padding: 10 },
    messageBubble: { maxWidth: '80%', padding: 10, borderRadius: 15, marginBottom: 10,},
    myMessage: { backgroundColor: '#dcf8c6', alignSelf: 'flex-end', },
    theirMessage: { backgroundColor: '#ffffff', alignSelf: 'flex-start', },
    usernameText: { fontWeight: 'bold', fontSize: 12, marginBottom: 2 },
    messageText: { fontSize: 16 },
    timeText: { fontSize: 10, color: 'gray', alignSelf: 'flex-end', marginTop: 4 },
    inputContainer: { flexDirection: 'row', padding: 10, borderTopWidth: 1, borderTopColor: '#ccc', backgroundColor: '#fff' },
    locationButton: { backgroundColor: '#4CAF50', paddingHorizontal: 15, justifyContent: 'center', borderRadius: 20, marginRight: 10, },
    textInput: { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 20, paddingHorizontal: 15, paddingVertical: 10, backgroundColor: '#f9f9f9' },
    sendButton: { backgroundColor: '#007bff', paddingHorizontal: 15, justifyContent: 'center', borderRadius: 20, marginLeft: 10, },
    buttonText: { color: 'white', fontWeight: 'bold' },
    locationContainer: { backgroundColor: 'white', borderRadius: 15, padding: 5, width: 250, marginBottom: 10, borderWidth: 1, borderColor: '#ddd' },
    locationUsername: { paddingHorizontal: 10, paddingTop: 5, fontWeight: 'bold', fontSize: 12},
    locationMapBubble: { height: 120, width: '100%', borderRadius: 10, marginTop: 5},
    closeButton: { position: 'absolute', bottom: 30, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.7)', padding: 15, borderRadius: 20 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    cancelButton: { position: 'absolute', top: 60, left: 20, backgroundColor: 'rgba(0,0,0,0.6)', padding: 15, borderRadius: 20 },
    sendPreviewButton: { position: 'absolute', bottom: 40, alignSelf: 'center', backgroundColor: '#007bff', paddingVertical: 15, paddingHorizontal: 30, borderRadius: 30 },
    endedBanner: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: '#d9534f',
      padding: 15,
      paddingBottom: 30,
    },
    endedBannerTitle: {
      color: 'white',
      fontSize: 16,
      fontWeight: 'bold',
      textAlign: 'center',
    },
    endedBannerSubtitle: {
      color: 'white',
      fontSize: 12,
      textAlign: 'center',
      marginTop: 4,
    },
});
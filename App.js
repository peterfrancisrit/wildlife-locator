// Updated App.js to include detailed marker information, proper mapping of survey counts, and autofill search
import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, FlatList, ActivityIndicator, TextInput, Button, KeyboardAvoidingView, Platform, ScrollView, Modal, TouchableOpacity } from 'react-native';
import MapView, { Marker, Callout } from 'react-native-maps';
import axios from 'axios';

export default function App() {
  const [location, setLocation] = useState(null);
  const [keyword, setKeyword] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [radius, setRadius] = useState(60000); // Default radius
  const [projectMetadata, setProjectMetadata] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [markers, setMarkers] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);

  const debounce = (func, delay) => {
    let timeoutId;
    return (...args) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func(...args), delay);
    };
  };

  useEffect(() => {
    // Set initial location
    (async () => {
      try {
        const response = await Location.getCurrentPositionAsync({});
        setLocation({
          latitude: response.coords.latitude,
          longitude: response.coords.longitude,
        });
      } catch {
        setLocation({ latitude: -16.9186, longitude: 145.7781 }); // Default location
      }
    })();
  }, []);

  const fetchSuggestions = debounce(async (input) => {
    if (!input) return;
    setLoadingSuggestions(true);
    try {
      const response = await axios.get(
        `https://apps.des.qld.gov.au/species/?op=speciessearch&kingdom=animals&species=${encodeURIComponent(input)}`
      );
      setSuggestions(response.data.Species || []);
    } catch (error) {
      console.error('Error fetching suggestions:', error);
    } finally {
      setLoadingSuggestions(false);
    }
  }, 300);

  const fetchProjects = async (selectedKeyword) => {
    setLoadingProjects(true);
    setErrorMsg(null);
    setProjectMetadata([]);
    setMarkers([]);

    try {
      const api1Url = `https://apps.des.qld.gov.au/species/?op=projectsearch&projtitle=${selectedKeyword}`;
      const api1Response = await axios.get(api1Url);
      const projectIDs = api1Response.data?.Project?.map((project) => project.ProjectID) || [];

      if (projectIDs.length === 0) {
        setErrorMsg(`No results found for keyword: ${selectedKeyword}`);
        return;
      }

      const api2Url = `https://apps.des.qld.gov.au/species/?op=getsurveys&projids=${projectIDs.join(',')}&circle=${location.latitude},${location.longitude},${radius}`;
      const api2Response = await axios.get(api2Url);

      const surveys = api2Response.data?.features || [];
      const newMarkers = surveys.map((survey) => ({
        id: survey.id,
        coordinate: {
          latitude: survey.geometry.coordinates[1],
          longitude: survey.geometry.coordinates[0],
        },
        title: survey.properties.ProjectName,
        description: survey.properties.LocalityDetails,
      }));

      setMarkers(newMarkers);

      const api3Url = `https://apps.des.qld.gov.au/species/?op=getprojectsmetadatabyid&projids=${projectIDs.join(',')}`;
      const api3Response = await axios.get(api3Url);
      const metadata = api3Response.data?.ProjectMetadata;

      setProjectMetadata(Array.isArray(metadata) ? metadata : [metadata]);
    } catch (error) {
      console.error('Error fetching projects:', error);
      setErrorMsg('An error occurred while fetching data. Please try again.');
    } finally {
      setLoadingProjects(false);
    }
  };

  const handleInputChange = (text) => {
    setKeyword(text);
    fetchSuggestions(text);
  };

  const handleSuggestionSelect = (suggestion) => {
    setKeyword(suggestion.SpeciesName);
    setSuggestions([]);
    fetchProjects(suggestion.SpeciesName);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <MapView
        style={styles.map}
        region={{
          latitude: location?.latitude || 0,
          longitude: location?.longitude || 0,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
        onPress={(e) => setLocation(e.nativeEvent.coordinate)}
      >
        {markers.map((marker) => (
          <Marker key={marker.id} coordinate={marker.coordinate} title={marker.title}>
            <Callout>
              <View style={styles.calloutContainer}>
                <Text style={styles.calloutTitle}>{marker.title}</Text>
                <Text>{marker.description}</Text>
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>

      <ScrollView contentContainerStyle={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Type species name..."
          placeholderTextColor="#aaa"
          value={keyword}
          onChangeText={handleInputChange}
        />
        {loadingSuggestions && <ActivityIndicator size="small" color="#0000ff" />}
        {suggestions.length > 0 && (
          <FlatList
            style={styles.suggestionList}
            data={suggestions}
            keyExtractor={(item) => item.SpeciesID}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.suggestionItem}
                onPress={() => handleSuggestionSelect(item)}
              >
                <Text>{item.SpeciesName}</Text>
              </TouchableOpacity>
            )}
          />
        )}
        <TextInput
          style={styles.input}
          placeholder="Radius in meters"
          placeholderTextColor="#aaa"
          value={radius.toString()}
          onChangeText={(value) => setRadius(Number(value))}
          keyboardType="numeric"
        />
        <Button title="Search" onPress={() => fetchProjects(keyword)} disabled={loadingProjects || !keyword} />
      </ScrollView>

      {loadingProjects && <ActivityIndicator size="large" color="#0000ff" />}
      {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}

      <FlatList
        style={styles.projectList}
        data={projectMetadata}
        keyExtractor={(item) => item.Project.ProjectID.toString()}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.projectItem}
            onPress={() => {
              setSelectedProject(item);
              setModalVisible(true);
            }}
          >
            <Text>Project Name: {item.Project.Name}</Text>
          </TouchableOpacity>
        )}
      />

      <Modal visible={modalVisible} animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalContainer}>
          <ScrollView>
            {selectedProject && (
              <View>
                <Text style={styles.modalTitle}>Project Name:</Text>
                <Text>{selectedProject.Project.Name}</Text>
              </View>
            )}
            <Button title="Close" onPress={() => setModalVisible(false)} />
          </ScrollView>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  map: { width: '100%', height: 250 },
  inputContainer: { padding: 10 },
  input: { borderWidth: 1, borderColor: '#ccc', padding: 10, marginBottom: 10, borderRadius: 5 },
  suggestionList: { maxHeight: 150, borderWidth: 1, borderColor: '#ccc', marginBottom: 10 },
  suggestionItem: { padding: 10, borderBottomWidth: 1, borderBottomColor: '#eee' },
  calloutContainer: { padding: 10 },
  calloutTitle: { fontWeight: 'bold' },
  projectList: { marginTop: 10 },
  projectItem: { padding: 10, borderBottomWidth: 1, borderBottomColor: '#ccc' },
  modalContainer: { flex: 1, padding: 20, backgroundColor: '#fff' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  errorText: { color: 'red', textAlign: 'center', marginVertical: 10 },
});

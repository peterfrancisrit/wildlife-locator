import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, FlatList, ActivityIndicator, TextInput, Linking, Button, KeyboardAvoidingView, Platform, ScrollView, Modal, TouchableOpacity } from 'react-native';
import MapView, { Marker, Callout } from 'react-native-maps';
import axios from 'axios';

export default function App() {
  const [location, setLocation] = useState(null);
  const [manualMarker, setManualMarker] = useState(null); // For manual marker placement
  const [keyword, setKeyword] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [radius, setRadius] = useState(''); // Default radius
  const [surveyData, setSurveyData] = useState([]);
  const [projectMetadata, setProjectMetadata] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [markers, setMarkers] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedSpecies, setSelectedSpecies] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isTypingKeyword, setIsTypingKeyword] = useState(false);
  const [isFullScreenMap, setIsFullScreenMap] = useState(false);
  const [setLocationMode, setSetLocationMode] = useState(false); // "Set Location" mode

  useEffect(() => {
    // Set initial location
    (async () => {
      try {
        const response = await Location.getCurrentPositionAsync({});
        const initialLocation = {
          latitude: response.coords.latitude,
          longitude: response.coords.longitude,
        };
        setLocation(initialLocation);
        setManualMarker(initialLocation); // Initialize manual marker
      } catch {
        const fallbackLocation = { latitude: -16.9186, longitude: 145.7781 };
        setLocation(fallbackLocation);
        setManualMarker(fallbackLocation); // Initialize manual marker
      }
    })();
  }, []);

  const handleRadiusChange = (value) => {
    setRadius(Number(value)); // Update the radius state
    setIsTypingKeyword(false); // Set isTypingKeyword to false when typing in the radius
  };
  

  const handleGoogleSearch = (project) => {
    if (!project) return;
    const query = encodeURIComponent(`${project.Name} ${project.CustodianOrganisation?.Name || ''} ${project.Abstract || ''}`);
    const url = `https://www.google.com/search?q=${query}`;
    Linking.openURL(url).catch((err) => console.error('Error opening URL:', err));
  };

  const fetchSuggestions = async (input) => {
    if (!input) return;
    setLoadingSuggestions(true);
    try {
      const response = await axios.get(
        `https://apps.des.qld.gov.au/species/?op=speciessearch&kingdom=animals&species=${encodeURIComponent(input)}`
      );
      const species = response.data?.Species || [];
      species.sort((a, b) => a.ScientificName.localeCompare(b.ScientificName)); // Alphabetical sorting
      setSuggestions(species);
    } catch (error) {
      console.error('Error fetching suggestions:', error);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const fetchSurveys = async (taxonId) => {
    if (!taxonId) {
      alert('No species selected.');
      return;
    }

    setLoadingProjects(true);
    setErrorMsg(null);
    setSurveyData([]);
    setMarkers([]);

    try {
      const apiUrl = `https://apps.des.qld.gov.au/species/?op=getsurveysbyspecies&taxonid=${taxonId}&circle=${location.latitude},${location.longitude},${radius}`;
      const response = await axios.get(apiUrl);

      const surveys = response.data?.features || [];
      if (surveys.length === 0) {
        setErrorMsg('No surveys found for the selected radius. Try increasing the radius.');
        setProjectMetadata([]);
        setMarkers([]);
        return;
      }

      const projectIDs = new Map(); // Map to store counts of ProjectID occurrences
      const markerGroups = {};

      // Group surveys and count project occurrences
      surveys.forEach((survey) => {
        const projectID = survey.properties.ProjectID;
        const coordKey = `${survey.geometry.coordinates[1]},${survey.geometry.coordinates[0]}`;

        // Count ProjectID occurrences
        if (projectID) {
          projectIDs.set(projectID, (projectIDs.get(projectID) || 0) + 1);
        }

        // Group surveys by unique coordinates
        if (!markerGroups[coordKey]) {
          markerGroups[coordKey] = {
            coordinate: {
              latitude: survey.geometry.coordinates[1],
              longitude: survey.geometry.coordinates[0],
            },
            surveys: [],
          };
        }
        markerGroups[coordKey].surveys.push(survey.properties);
      });

      const surveyMarkers = Object.values(markerGroups).map((group) => ({
        ...group,
        surveyDetails: group.surveys.map((survey) => ({
          projectName: survey.ProjectName,
          localityDetails: survey.LocalityDetails,
          startDate: survey.StartDate,
          endDate: survey.EndDate,
          siteCode: survey.SiteCode,
          precision: survey.LocationPrecision,
        })),
      }));

      setMarkers(surveyMarkers);
      fetchProjectsMetadata([...projectIDs.keys()], projectIDs);
    } catch (error) {
      console.error('Error fetching survey data:', error);
      setErrorMsg('An error occurred while fetching survey data. Please try again.');
    } finally {
      setLoadingProjects(false);
    }
  };

  const fetchProjectsMetadata = async (projectIDs, surveyCounts) => {
    try {
      const apiUrl = `https://apps.des.qld.gov.au/species/?op=getprojectsmetadatabyid&projids=${projectIDs.join(',')}`;
      const response = await axios.get(apiUrl);
      const metadata = response.data?.ProjectMetadata;

      const combinedMetadata = Array.isArray(metadata)
        ? metadata.map((project) => ({
            ...project,
            surveyCount: surveyCounts.get(project.Project.ProjectID) || 0,
          }))
        : [
            {
              ...metadata,
              surveyCount: surveyCounts.get(metadata.Project.ProjectID) || 0,
            },
          ];

      setProjectMetadata(combinedMetadata);
    } catch (error) {
      console.error('Error fetching project metadata:', error);
    }
  };

  const handleInputChange = (text) => {
    setKeyword(text);

    if (text.trim() === '') {
      setSuggestions([]);
      setIsTypingKeyword(false);
      return;
    }

    setIsTypingKeyword(true);
    fetchSuggestions(text);
  };

  const handleSearch = () => {
    if (selectedSpecies) {
      setSuggestions([]);
      setIsTypingKeyword(false);
      setIsSearching(true);
      fetchSurveys(selectedSpecies.TaxonID).finally(() => setIsSearching(false));
    } else {
      alert('Please select a species before searching.');
    }
  };

  const handleSuggestionSelect = (suggestion) => {
    setKeyword(suggestion.ScientificName);
    setSuggestions([]);
    setSelectedSpecies(suggestion);
  };

  const handleMapPress = (e) => {
    if (setLocationMode) {
      const newLocation = e.nativeEvent.coordinate;
      setManualMarker(newLocation);
      setLocation(newLocation);
    }
  };

  const renderProject = ({ item }) => {
    const project = item.Project;
    return (
      <TouchableOpacity
        style={styles.listItem}
        onPress={() => {
          setSelectedProject(item);
          setModalVisible(true);
        }}
      >
        <Text style={styles.groupName}>Project Name:</Text>
        <Text style={styles.itemValue}>{project.Name}</Text>
        <Text style={styles.groupName}>Number of Surveys:</Text>
        <Text style={styles.itemValue}>{item.surveyCount}</Text>
        <Text style={styles.groupName}>Department Name:</Text>
        <Text style={styles.itemValue}>{project.CustodianOrganisation?.Name}</Text>
        <Text style={styles.groupName}>Organisation Type:</Text>
        <Text style={styles.itemValue}>{project.CustodianOrganisation?.OrganisationTypeDescription}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {isFullScreenMap ? (
        <View style={styles.fullScreenContainer}>
          <MapView
            style={styles.fullScreenMap}
            region={{
              latitude: location?.latitude || 0,
              longitude: location?.longitude || 0,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            }}
            onPress={handleMapPress}
          >
            <Marker coordinate={manualMarker} title="My Location" pinColor="blue" />
            {markers.map((marker, index) => (
              <Marker key={index} coordinate={marker.coordinate} pinColor="red">
                <Callout>
                  <ScrollView>
                    {marker.surveyDetails.map((survey, i) => (
                      <View key={i} style={{ marginBottom: 10 }}>
                        <Text style={styles.calloutTitle}>{survey.projectName}</Text>
                        <Text>Location: {survey.localityDetails}</Text>
                        <Text>Start: {survey.startDate}</Text>
                        <Text>End: {survey.endDate}</Text>
                        <Text>Code: {survey.siteCode}</Text>
                        <Text>Precision: {survey.precision}m</Text>
                      </View>
                    ))}
                  </ScrollView>
                </Callout>
              </Marker>
            ))}
          </MapView>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => setIsFullScreenMap(false)}
          >
            <Text style={styles.closeButtonText}>Close Map</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.container}
        >
          <View style={styles.mapContainer}>
            <MapView
              style={styles.map}
              region={{
                latitude: location?.latitude || 0,
                longitude: location?.longitude || 0,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
              }}
              onPress={handleMapPress}
            >
              <Marker coordinate={manualMarker} title="My Location" pinColor="blue" />
              {markers.map((marker, index) => (
                <Marker key={index} coordinate={marker.coordinate} pinColor="red">
                  <Callout>
                    <ScrollView>
                      {marker.surveyDetails.map((survey, i) => (
                        <View key={i} style={{ marginBottom: 10 }}>
                          <Text style={styles.calloutTitle}>{survey.projectName}</Text>
                          <Text>Location: {survey.localityDetails}</Text>
                          <Text>Start: {survey.startDate}</Text>
                          <Text>End: {survey.endDate}</Text>
                          <Text>Code: {survey.siteCode}</Text>
                          <Text>Precision: {survey.precision}m</Text>
                        </View>
                      ))}
                    </ScrollView>
                  </Callout>
                </Marker>
              ))}
            </MapView>
            <TouchableOpacity
              style={styles.expandButton}
              onPress={() => setIsFullScreenMap(true)}
            >
              <Text style={styles.expandButtonText}>Expand Map</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Type species name..."
              placeholderTextColor="#aaa"
              value={keyword}
              onChangeText={handleInputChange}
            />
            {!isSearching && isTypingKeyword && suggestions.length > 0 && (
              <FlatList
                style={styles.suggestionList}
                data={suggestions}
                keyExtractor={(item) => item.TaxonID.toString()}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.suggestionItem}
                    onPress={() => handleSuggestionSelect(item)}
                  >
                    <Text>{item.ScientificName} ({item.AcceptedCommonName})</Text>
                  </TouchableOpacity>
                )}
              />
            )}
            <TextInput
              style={styles.input}
              placeholder="Radius in meters"
              placeholderTextColor="#aaa"
              value={radius.toString()}
              onChangeText={handleRadiusChange}
              keyboardType="numeric"
            />
            <Button
              title="Search"
              onPress={handleSearch}
              disabled={loadingProjects || !selectedSpecies}
            />
            <Button
              title={setLocationMode ? "Disable Set Location" : "Enable Set Location"}
              onPress={() => setSetLocationMode(!setLocationMode)}
            />
          </View>

          {loadingProjects && <ActivityIndicator size="large" color="#0000ff" style={styles.loader} />}
          {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}

          <FlatList
            style={styles.listExpanded}
            data={projectMetadata}
            keyExtractor={(item) => item.Project.ProjectID.toString()}
            renderItem={renderProject}
          />

          <Modal
            visible={modalVisible}
            animationType="slide"
            onRequestClose={() => setModalVisible(false)}
          >
            <ScrollView style={styles.modalContainer}>
              {selectedProject && (
                <View>
                  <Text style={styles.modalTitle}>Project Name:</Text>
                  <Text style={styles.itemValue}>{selectedProject.Project.Name}</Text>
                  <Text style={styles.modalTitle}>Number of Surveys:</Text>
                  <Text style={styles.itemValue}>{selectedProject.surveyCount}</Text>
                  <Text style={styles.modalTitle}>Department Name:</Text>
                  <Text style={styles.itemValue}>{selectedProject.Project.CustodianOrganisation?.Name}</Text>
                  <Text style={styles.modalTitle}>Organisation Type:</Text>
                  <Text style={styles.itemValue}>{selectedProject.Project.CustodianOrganisation?.OrganisationTypeDescription}</Text>
                  <Text style={styles.modalTitle}>Source Name:</Text>
                  <Text style={styles.itemValue}>{selectedProject.Project.Source?.Name}</Text>
                  <Text style={styles.modalTitle}>State of Jurisdiction:</Text>
                  <Text style={styles.itemValue}>{selectedProject.JurisdictionDescription}</Text>
                  <Text style={styles.modalTitle}>Abstract:</Text>
                  <Text style={styles.itemValue}>{selectedProject.Abstract}</Text>
                  <Text style={styles.modalTitle}>Geographical Extent:</Text>
                  <Text style={styles.itemValue}>{selectedProject.GeographicalExtent}</Text>
                  <Text style={styles.modalTitle}>Beginning Date:</Text>
                  <Text style={styles.itemValue}>{selectedProject.BeginDate}</Text>
                  <Text style={styles.modalTitle}>Project Progress:</Text>
                  <Text style={styles.itemValue}>{selectedProject.ProgressDescription}</Text>
                  <Text style={styles.modalTitle}>Data Last Loaded:</Text>
                  <Text style={styles.itemValue}>{selectedProject.LastLoadDate}</Text>

                  {/* google search button */}
                  <Button
                    title="Google Project"
                    onPress={() => handleGoogleSearch(selectedProject.Project)}
                  />
                </View>
              )}
              <Button title="Close" onPress={() => setModalVisible(false)} />
            </ScrollView>
          </Modal>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  map: { width: '100%', height: 250 },
  inputContainer: { padding: 10 },
  input: { borderWidth: 1, borderColor: '#ccc', padding: 10, marginBottom: 10, borderRadius: 5 },
  suggestionList: { maxHeight: 150, borderWidth: 1, borderColor: '#ccc', marginBottom: 10 },
  suggestionItem: { padding: 10, borderBottomWidth: 1, borderBottomColor: '#eee' },
  calloutTitle: { fontWeight: 'bold', fontSize: 16 },
  fullScreenContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  fullScreenMap: {
    flex: 1,
  },
  closeButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 5,
    padding: 10,
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 16,
  },
  expandButton: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 5,
    padding: 10,
  },
  expandButtonText: {
    color: '#fff',
    fontSize: 16,
  },
  loader: { marginVertical: 20 },
  listExpanded: { flex: 1, paddingHorizontal: 10 },
  listItem: { padding: 10, borderBottomWidth: 1, borderBottomColor: '#ccc', backgroundColor: '#fff' },
  groupName: { fontSize: 16, fontWeight: 'bold', color: '#333', marginTop: 10 },
  itemValue: { fontSize: 14, color: '#555', marginBottom: 10 },
  errorText: { color: 'red', textAlign: 'center', marginVertical: 10 },
  modalContainer: { flex: 1, padding: 20, backgroundColor: '#fff' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginTop: 10 },
});

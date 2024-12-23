// Updated App.js with extra padding for iPhone, improved text layout, and draggable marker
import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, FlatList, ActivityIndicator, TextInput, Button, KeyboardAvoidingView, Platform, ScrollView, Modal, TouchableOpacity } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import axios from 'axios';

export default function App() {
  const [location, setLocation] = useState(null);
  const [keyword, setKeyword] = useState('');
  const [radius, setRadius] = useState(6000); // Default radius
  const [projectMetadata, setProjectMetadata] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [keywordProjectCount, setKeywordProjectCount] = useState(0);
  const [areaProjectCount, setAreaProjectCount] = useState(0);
  const [selectedProject, setSelectedProject] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

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

  const fetchProjects = async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      // Step 1: Fetch projects by keyword (API 1)
      const api1Response = await axios.get(`https://apps.des.qld.gov.au/species/?op=projectsearch&projtitle=${keyword}`);
      const projectIDs = api1Response.data?.Project?.map((project) => project.ProjectID) || [];
      setKeywordProjectCount(projectIDs.length);

      if (projectIDs.length === 0) {
        setErrorMsg(`No results found for keyword: ${keyword}`);
        setLoading(false);
        return;
      }

      // Step 2: Filter projects by location (API 2)
      const api2Response = await axios.get(
        `https://apps.des.qld.gov.au/species/?op=getprojects&circle=${location.latitude},${location.longitude},${radius}`
      );
      const filteredProjects = api2Response.data?.Project?.filter((project) => projectIDs.includes(project.ProjectID)) || [];
      setAreaProjectCount(filteredProjects.length);

      if (filteredProjects.length === 0) {
        setErrorMsg(`No results found for keyword: ${keyword} within ${radius} meters. Try increasing the radius.`);
        setLoading(false);
        return;
      }

      const filteredProjectIDs = filteredProjects.map((project) => project.ProjectID);

      // Step 3: Fetch metadata for the filtered projects (API 3)
      const api3Response = await axios.get(
        `https://apps.des.qld.gov.au/species/?op=getprojectsmetadatabyid&projids=${filteredProjectIDs.join(',')}`
      );

      const metadata = api3Response.data?.ProjectMetadata;
      if (!metadata) {
        setErrorMsg(`No metadata found for projects.`);
        setLoading(false);
        return;
      }

      // Handle single metadata object
      if (!Array.isArray(metadata)) {
        setProjectMetadata([metadata]); // Wrap the single object in an array for consistency
        setLoading(false);
        return;
      }

      // Sort metadata by LastLoadDate if multiple entries exist
      const sortedMetadata = metadata.sort(
        (a, b) => new Date(b.LastLoadDate) - new Date(a.LastLoadDate)
      );
      setProjectMetadata(sortedMetadata);
    } catch (error) {
      console.error('Error fetching project data:', error);
      setErrorMsg('An error occurred while fetching data. Please try again.');
    } finally {
      setLoading(false);
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
        <Text style={styles.groupName}>Department Name:</Text>
        <Text style={styles.itemValue}>{project.CustodianOrganisation?.Name}</Text>
        <Text style={styles.groupName}>Organisation Type:</Text>
        <Text style={styles.itemValue}>{project.CustodianOrganisation?.OrganisationTypeDescription}</Text>
      </TouchableOpacity>
    );
  };

  if (!location) {
    return (
      <View style={styles.containerCenter}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <MapView
        style={styles.map}
        region={{
          latitude: location.latitude,
          longitude: location.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
        onPress={(e) => setLocation(e.nativeEvent.coordinate)}
      >
        <Marker
          coordinate={location}
          draggable
          onDragEnd={(e) => setLocation(e.nativeEvent.coordinate)}
          title="Your Location"
        />
      </MapView>

      <View style={styles.summaryContainer}>
        <Text style={styles.summaryText}>Projects Found for Keyword: {keywordProjectCount}</Text>
        <Text style={styles.summaryText}>Projects Found in Area: {areaProjectCount}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Enter keyword"
          placeholderTextColor="#aaa"
          value={keyword}
          onChangeText={setKeyword}
        />
        <TextInput
          style={styles.input}
          placeholder="Radius in meters"
          placeholderTextColor="#aaa"
          value={radius.toString()}
          onChangeText={(value) => setRadius(Number(value))}
          keyboardType="numeric"
        />
        <Button title="Search" onPress={fetchProjects} disabled={loading || !keyword} />
      </ScrollView>

      {loading && <ActivityIndicator size="large" color="#0000ff" style={styles.loader} />}

      {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}

      <FlatList
        style={styles.listExpanded}
        data={projectMetadata}
        keyExtractor={(item) => item.Project.ProjectID.toString()}
        renderItem={renderProject}
      />

      {/* Modal for full-screen project view */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <ScrollView>
            {selectedProject && (
              <View>
                <Text style={styles.modalTitle}>Project Name:</Text>
                <Text style={styles.itemValue}>{selectedProject.Project.Name}</Text>
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
  container: { flex: 1, backgroundColor: '#f5f5f5', paddingTop: Platform.OS === 'ios' ? 50 : 0 },
  containerCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  map: { width: '100%', height: 250 },
  inputContainer: { padding: 10 },
  input: { width: '100%', borderWidth: 1, borderColor: '#ccc', padding: 10, marginVertical: 5, borderRadius: 5 },
  loader: { marginVertical: 20 },
  listExpanded: { flex: 1, paddingHorizontal: 10 },
  listItem: { padding: 10, borderBottomWidth: 1, borderBottomColor: '#ccc', backgroundColor: '#fff' },
  groupName: { fontSize: 16, fontWeight: 'bold', color: '#333', marginTop: 10 },
  itemValue: { fontSize: 14, color: '#555', marginBottom: 10 },
  errorText: { color: 'red', textAlign: 'center', marginVertical: 10 },
  summaryContainer: { padding: 10, backgroundColor: '#eaeaea', marginVertical: 10 },
  summaryText: { fontSize: 14, fontWeight: 'bold', color: '#333' },
  modalContainer: { flex: 1, padding: 20, backgroundColor: '#fff' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginTop: 10 },
});

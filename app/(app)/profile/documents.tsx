import { View, Text, ScrollView, TouchableOpacity, StyleSheet, useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, FileText, Download, Eye, Plus } from 'lucide-react-native';
import { useRole } from '@/hooks/useRole';

// Embedded mock documents data
const mockDocuments = [
  {
    id: '1',
    name: 'Certification - HVAC Specialist.pdf',
    type: 'PDF',
    size: '2.4 MB',
    date: 'Jan 15, 2024',
    icon: FileText,
    color: '#3b82f6',
    category: 'certificate'
  },
  {
    id: '2',
    name: 'Driver License.pdf',
    type: 'PDF',
    size: '1.1 MB',
    date: 'Jan 10, 2024',
    icon: FileText,
    color: '#10b981',
    category: 'id'
  },
  {
    id: '3',
    name: 'Safety Training Certificate.pdf',
    type: 'PDF',
    size: '3.2 MB',
    date: 'Dec 28, 2023',
    icon: FileText,
    color: '#8b5cf6',
    category: 'certificate'
  },
  {
    id: '4',
    name: 'Employment Contract.pdf',
    type: 'PDF',
    size: '1.8 MB',
    date: 'Dec 15, 2023',
    icon: FileText,
    color: '#f59e0b',
    category: 'contract'
  },
  {
    id: '5',
    name: 'Monthly Report - January.pdf',
    type: 'PDF',
    size: '4.2 MB',
    date: 'Feb 1, 2024',
    icon: FileText,
    color: '#ef4444',
    category: 'report'
  },
  {
    id: '6',
    name: 'Tool Inventory List.xlsx',
    type: 'Excel',
    size: '0.8 MB',
    date: 'Jan 20, 2024',
    icon: FileText,
    color: '#3b82f6',
    category: 'inventory'
  },
  {
    id: '7',
    name: 'Performance Review.pdf',
    type: 'PDF',
    size: '1.3 MB',
    date: 'Dec 5, 2023',
    icon: FileText,
    color: '#10b981',
    category: 'review'
  },
  {
    id: '8',
    name: 'W9 Form.pdf',
    type: 'PDF',
    size: '0.5 MB',
    date: 'Nov 28, 2023',
    icon: FileText,
    color: '#8b5cf6',
    category: 'form'
  },
];

export default function DocumentsScreen() {
  const router = useRouter();
  const { role } = useRole();
  const isDarkMode = useColorScheme() === 'dark';

  // Calculate category counts
  const categories = [
    { id: 'all', emoji: '📄', label: 'All', count: mockDocuments.length },
    { id: 'certificate', emoji: '📋', label: 'Certificates', count: mockDocuments.filter(d => d.category === 'certificate').length },
    { id: 'id', emoji: '🆔', label: 'ID', count: mockDocuments.filter(d => d.category === 'id').length },
    { id: 'report', emoji: '📊', label: 'Reports', count: mockDocuments.filter(d => d.category === 'report').length },
    { id: 'contract', emoji: '📝', label: 'Contracts', count: mockDocuments.filter(d => d.category === 'contract').length },
  ];

  return (
    <View style={[styles.container, { backgroundColor: isDarkMode ? '#000' : '#f8fafc' }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: isDarkMode ? '#1f2937' : '#fff' }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color={isDarkMode ? '#fff' : '#1e293b'} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: isDarkMode ? '#fff' : '#1e293b' }]}>
          My Documents
        </Text>
        <TouchableOpacity style={styles.addButton}>
          <Plus size={24} color={isDarkMode ? '#fff' : '#1e293b'} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={true}>
        {/* Document Categories */}
        <View style={styles.categoriesContainer}>
          {categories.map((category) => (
            <TouchableOpacity 
              key={category.id}
              style={[styles.categoryCard, { backgroundColor: isDarkMode ? '#1f2937' : '#fff' }]}
            >
              <Text style={[styles.categoryEmoji, { color: isDarkMode ? '#fff' : '#1e293b' }]}>
                {category.emoji}
              </Text>
              <Text style={[styles.categoryLabel, { color: isDarkMode ? '#9ca3af' : '#64748b' }]}>
                {category.label}
              </Text>
              <Text style={[styles.categoryCount, { color: isDarkMode ? '#fff' : '#1e293b' }]}>
                {category.count}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Documents List */}
        <View style={styles.documentsList}>
          <Text style={[styles.listTitle, { color: isDarkMode ? '#fff' : '#1e293b' }]}>
            All Documents
          </Text>
          
          {mockDocuments.map((doc) => (
            <TouchableOpacity 
              key={doc.id}
              style={[styles.documentCard, { backgroundColor: isDarkMode ? '#1f2937' : '#fff' }]}
            >
              <View style={styles.documentLeft}>
                <View style={[styles.documentIcon, { backgroundColor: `${doc.color}20` }]}>
                  <doc.icon color={doc.color} size={24} />
                </View>
                <View style={styles.documentInfo}>
                  <Text style={[styles.documentName, { color: isDarkMode ? '#fff' : '#1e293b' }]}>
                    {doc.name}
                  </Text>
                  <View style={styles.documentMeta}>
                    <Text style={[styles.documentMetaText, { color: isDarkMode ? '#9ca3af' : '#64748b' }]}>
                      {doc.type} • {doc.size}
                    </Text>
                    <Text style={[styles.documentDate, { color: isDarkMode ? '#9ca3af' : '#64748b' }]}>
                      {doc.date}
                    </Text>
                  </View>
                </View>
              </View>
              
              <View style={styles.documentActions}>
                <TouchableOpacity style={styles.actionButton}>
                  <Eye size={20} color={isDarkMode ? '#9ca3af' : '#64748b'} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionButton}>
                  <Download size={20} color={isDarkMode ? '#9ca3af' : '#64748b'} />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  addButton: {
    padding: 8,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  categoriesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 24,
    gap: 8,
  },
  categoryCard: {
    width: '18%',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  categoryEmoji: {
    fontSize: 20,
    marginBottom: 4,
  },
  categoryLabel: {
    fontSize: 10,
    marginBottom: 4,
    textAlign: 'center',
  },
  categoryCount: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  documentsList: {
    gap: 12,
    paddingBottom: 40,
  },
  listTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  documentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  documentLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  documentIcon: {
    width: 48,
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  documentInfo: {
    flex: 1,
  },
  documentName: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  documentMeta: {
    flexDirection: 'row',
    gap: 8,
  },
  documentMetaText: {
    fontSize: 12,
  },
  documentDate: {
    fontSize: 12,
  },
  documentActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    padding: 4,
  },
});
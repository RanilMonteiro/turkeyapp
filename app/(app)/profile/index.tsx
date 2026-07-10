import { View, Text, ScrollView, TouchableOpacity, StyleSheet, useColorScheme, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { 
  ArrowLeft, 
  FileText, 
  Download, 
  Eye, 
  Plus, 
  Search,
  Filter,
  Grid3x3,
  List,
  Star,
  Clock,
  HardDrive,
  FileJson,
  FileSpreadsheet
} from 'lucide-react-native';
import { useState } from 'react';

// Company colors
const colors = {
  yellow: '#fbbf24',
  yellowLight: '#fef3c7',
  yellowDark: '#f59e0b',
  white: '#ffffff',
  black: '#000000',
  gray: {
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
    950: '#020617',
  }
};

// Embedded mock documents data with more variety
const mockDocuments = [
  {
    id: '1',
    name: 'HVAC Specialist Certification',
    type: 'PDF',
    size: '2.4 MB',
    date: 'Jan 15, 2024',
    icon: FileText,
    category: 'certificate',
    starred: true,
    recent: true
  },
  {
    id: '2',
    name: 'Driver License',
    type: 'PDF',
    size: '1.1 MB',
    date: 'Jan 10, 2024',
    icon: FileText,
    category: 'id',
    starred: false,
    recent: true
  },
  {
    id: '3',
    name: 'Safety Training Certificate',
    type: 'PDF',
    size: '3.2 MB',
    date: 'Dec 28, 2023',
    icon: FileText,
    category: 'certificate',
    starred: true,
    recent: false
  },
  {
    id: '4',
    name: 'Employment Contract',
    type: 'PDF',
    size: '1.8 MB',
    date: 'Dec 15, 2023',
    icon: FileText,
    category: 'contract',
    starred: false,
    recent: false
  },
  {
    id: '5',
    name: 'Monthly Report - January',
    type: 'Excel',
    size: '4.2 MB',
    date: 'Feb 1, 2024',
    icon: FileSpreadsheet,
    category: 'report',
    starred: false,
    recent: true
  },
  {
    id: '6',
    name: 'Tool Inventory List',
    type: 'Excel',
    size: '0.8 MB',
    date: 'Jan 20, 2024',
    icon: FileSpreadsheet,
    category: 'inventory',
    starred: false,
    recent: false
  },
  {
    id: '7',
    name: 'Performance Review',
    type: 'PDF',
    size: '1.3 MB',
    date: 'Dec 5, 2023',
    icon: FileText,
    category: 'review',
    starred: true,
    recent: false
  },
  {
    id: '8',
    name: 'W9 Form',
    type: 'PDF',
    size: '0.5 MB',
    date: 'Nov 28, 2023',
    icon: FileJson,
    category: 'form',
    starred: false,
    recent: false
  },
];

export default function DocumentsScreen() {
  const router = useRouter();
  const systemColorScheme = useColorScheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [showFilters, setShowFilters] = useState(false);

  // Determine if we're in dark mode
  const isDarkMode = systemColorScheme === 'dark';

  // Enhanced categories with icons and colors
  const categories = [
    { id: 'all', icon: '📁', label: 'All Docs', count: mockDocuments.length, color: colors.yellow },
    { id: 'starred', icon: '⭐', label: 'Starred', count: mockDocuments.filter(d => d.starred).length, color: colors.yellow },
    { id: 'recent', icon: '🕒', label: 'Recent', count: mockDocuments.filter(d => d.recent).length, color: colors.yellow },
    { id: 'certificate', icon: '📜', label: 'Certificates', count: mockDocuments.filter(d => d.category === 'certificate').length, color: colors.yellow },
    { id: 'report', icon: '📊', label: 'Reports', count: mockDocuments.filter(d => d.category === 'report').length, color: colors.yellow },
    { id: 'contract', icon: '📝', label: 'Contracts', count: mockDocuments.filter(d => d.category === 'contract').length, color: colors.yellow },
    { id: 'id', icon: '🆔', label: 'ID', count: mockDocuments.filter(d => d.category === 'id').length, color: colors.yellow },
  ];

  // Filter documents based on search and category
  const filteredDocuments = mockDocuments.filter(doc => {
    const matchesSearch = doc.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || 
      (selectedCategory === 'starred' ? doc.starred : 
       selectedCategory === 'recent' ? doc.recent :
       doc.category === selectedCategory);
    return matchesSearch && matchesCategory;
  });

  // Get file icon based on type
  const getFileIcon = (doc: typeof mockDocuments[0]) => {
    if (doc.type === 'Excel') return FileSpreadsheet;
    return FileText;
  };

  // Dynamic styles based on theme
  const themeStyles = {
    container: {
      backgroundColor: isDarkMode ? colors.black : colors.gray[50],
    },
    header: {
      backgroundColor: isDarkMode ? colors.gray[900] : colors.white,
      borderBottomColor: isDarkMode ? colors.gray[800] : colors.gray[200],
    },
    headerTitle: {
      color: isDarkMode ? colors.yellow : colors.gray[800],
    },
    card: {
      backgroundColor: isDarkMode ? colors.gray[900] : colors.white,
      borderColor: isDarkMode ? colors.gray[800] : colors.gray[200],
    },
    text: {
      primary: {
        color: isDarkMode ? colors.gray[200] : colors.gray[800],
      },
      secondary: {
        color: isDarkMode ? colors.gray[400] : colors.gray[500],
      },
      muted: {
        color: isDarkMode ? colors.gray[500] : colors.gray[400],
      },
    },
    iconBackground: {
      backgroundColor: isDarkMode ? `${colors.yellow}20` : colors.yellowLight,
    },
    searchContainer: {
      backgroundColor: isDarkMode ? colors.gray[900] : colors.white,
    },
    categoryChip: {
      backgroundColor: isDarkMode ? colors.gray[800] : colors.white,
      borderColor: isDarkMode ? colors.gray[700] : colors.gray[300],
    },
    statsBar: {
      backgroundColor: isDarkMode ? colors.gray[900] : colors.white,
    },
    actionButton: {
      backgroundColor: isDarkMode ? colors.gray[800] : colors.gray[100],
    },
  };

  return (
    <View style={[styles.container, themeStyles.container]}>
      {/* Header */}
      <View style={[styles.header, themeStyles.header]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color={colors.yellow} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, themeStyles.headerTitle]}>
          Documents
        </Text>
        <View style={styles.headerActions}>
          <TouchableOpacity 
            style={[
              styles.headerButton, 
              showFilters && { backgroundColor: isDarkMode ? `${colors.yellow}20` : colors.yellowLight }
            ]} 
            onPress={() => setShowFilters(!showFilters)}
          >
            <Filter 
              size={20} 
              color={showFilters ? colors.yellow : (isDarkMode ? colors.gray[400] : colors.gray[500])} 
            />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton}>
            <Plus size={20} color={colors.yellow} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search Bar */}
      <View style={[styles.searchContainer, themeStyles.searchContainer]}>
        <Search size={20} color={isDarkMode ? colors.gray[500] : colors.gray[400]} />
        <TextInput
          style={[styles.searchInput, themeStyles.text.primary]}
          placeholder="Search documents..."
          placeholderTextColor={isDarkMode ? colors.gray[600] : colors.gray[400]}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        <TouchableOpacity onPress={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}>
          {viewMode === 'grid' ? (
            <List size={20} color={colors.yellow} />
          ) : (
            <Grid3x3 size={20} color={colors.yellow} />
          )}
        </TouchableOpacity>
      </View>

      {/* Categories */}
      {showFilters && (
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.categoriesScroll}
          contentContainerStyle={styles.categoriesContainer}
        >
          {categories.map((category) => (
            <TouchableOpacity 
              key={category.id}
              style={[
                styles.categoryChip,
                { 
                  backgroundColor: selectedCategory === category.id 
                    ? colors.yellow 
                    : themeStyles.categoryChip.backgroundColor,
                  borderColor: selectedCategory === category.id 
                    ? colors.yellow 
                    : themeStyles.categoryChip.borderColor,
                }
              ]}
              onPress={() => setSelectedCategory(category.id)}
            >
              <Text style={styles.categoryIcon}>{category.icon}</Text>
              <Text style={[
                styles.categoryChipLabel,
                { color: selectedCategory === category.id ? colors.black : themeStyles.text.secondary.color }
              ]}>
                {category.label}
              </Text>
              {category.count > 0 && (
                <View style={[
                  styles.categoryChipBadge,
                  { backgroundColor: selectedCategory === category.id ? colors.black : colors.yellow }
                ]}>
                  <Text style={[
                    styles.categoryChipBadgeText,
                    { color: selectedCategory === category.id ? colors.yellow : colors.black }
                  ]}>
                    {category.count}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Stats Bar */}
      <View style={[styles.statsBar, themeStyles.statsBar]}>
        <View style={styles.statItem}>
          <HardDrive size={16} color={colors.yellow} />
          <Text style={[styles.statText, themeStyles.text.secondary]}>
            15.3 MB used
          </Text>
        </View>
        <View style={styles.statItem}>
          <Clock size={16} color={colors.yellow} />
          <Text style={[styles.statText, themeStyles.text.secondary]}>
            Updated today
          </Text>
        </View>
      </View>

      <ScrollView 
        style={styles.content} 
        showsVerticalScrollIndicator={true}
        contentContainerStyle={styles.contentContainer}
      >
        {/* Documents Grid/List */}
        {filteredDocuments.length === 0 ? (
          <View style={styles.emptyState}>
            <FileText size={48} color={isDarkMode ? colors.gray[700] : colors.gray[300]} />
            <Text style={[styles.emptyStateTitle, themeStyles.text.primary]}>
              No documents found
            </Text>
            <Text style={[styles.emptyStateText, themeStyles.text.muted]}>
              Try adjusting your search or filter
            </Text>
          </View>
        ) : viewMode === 'grid' ? (
          <View style={styles.gridContainer}>
            {filteredDocuments.map((doc) => {
              const FileIcon = getFileIcon(doc);
              return (
                <TouchableOpacity 
                  key={doc.id}
                  style={[styles.gridCard, themeStyles.card]}
                >
                  <View style={[styles.gridIconContainer, themeStyles.iconBackground]}>
                    <FileIcon color={isDarkMode ? colors.yellow : colors.yellowDark} size={32} />
                  </View>
                  <Text style={[styles.gridFileName, themeStyles.text.primary]} numberOfLines={2}>
                    {doc.name}
                  </Text>
                  <View style={styles.gridMeta}>
                    <Text style={[styles.gridFileType, { color: colors.yellow }]}>
                      {doc.type}
                    </Text>
                    <Text style={[styles.gridFileSize, themeStyles.text.secondary]}>
                      {doc.size}
                    </Text>
                  </View>
                  <View style={styles.gridFooter}>
                    <Text style={[styles.gridDate, themeStyles.text.muted]}>
                      {doc.date}
                    </Text>
                    {doc.starred && <Star size={14} color={colors.yellow} fill={colors.yellow} />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <View style={styles.listContainer}>
            {filteredDocuments.map((doc) => {
              const FileIcon = getFileIcon(doc);
              return (
                <TouchableOpacity 
                  key={doc.id}
                  style={[styles.documentCard, themeStyles.card]}
                >
                  <View style={styles.documentLeft}>
                    <View style={[styles.documentIcon, themeStyles.iconBackground]}>
                      <FileIcon color={isDarkMode ? colors.yellow : colors.yellowDark} size={24} />
                    </View>
                    <View style={styles.documentInfo}>
                      <Text style={[styles.documentName, themeStyles.text.primary]}>
                        {doc.name}
                      </Text>
                      <View style={styles.documentMeta}>
                        <View style={styles.documentMetaLeft}>
                          <Text style={[styles.documentType, { color: colors.yellow }]}>
                            {doc.type}
                          </Text>
                          <Text style={[styles.documentSize, themeStyles.text.secondary]}>
                            {doc.size}
                          </Text>
                          <Text style={[styles.documentDate, themeStyles.text.secondary]}>
                            {doc.date}
                          </Text>
                        </View>
                        {doc.starred && <Star size={14} color={colors.yellow} fill={colors.yellow} />}
                      </View>
                    </View>
                  </View>
                  
                  <View style={styles.documentActions}>
                    <TouchableOpacity style={[styles.actionButton, themeStyles.actionButton]}>
                      <Eye size={18} color={colors.yellow} />
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionButton, themeStyles.actionButton]}>
                      <Download size={18} color={colors.yellow} />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
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
  },
  backButton: {
    padding: 8,
    borderRadius: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    padding: 8,
    borderRadius: 8,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  searchInput: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
    fontSize: 16,
  },
  categoriesScroll: {
    maxHeight: 60,
    marginBottom: 8,
  },
  categoriesContainer: {
    paddingHorizontal: 16,
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  categoryIcon: {
    fontSize: 16,
  },
  categoryChipLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  categoryChipBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 12,
    minWidth: 20,
    alignItems: 'center',
  },
  categoryChipBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  statsBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statText: {
    fontSize: 13,
    fontWeight: '500',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingTop: 0,
  },
  // Grid View Styles
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  gridCard: {
    width: '47%',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  gridIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  gridFileName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  gridMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  gridFileType: {
    fontSize: 11,
    fontWeight: '600',
  },
  gridFileSize: {
    fontSize: 11,
  },
  gridFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  gridDate: {
    fontSize: 10,
  },
  // List View Styles
  listContainer: {
    gap: 8,
  },
  documentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
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
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  documentInfo: {
    flex: 1,
  },
  documentName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  documentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  documentMetaLeft: {
    flexDirection: 'row',
    gap: 8,
  },
  documentType: {
    fontSize: 12,
    fontWeight: '600',
  },
  documentSize: {
    fontSize: 12,
  },
  documentDate: {
    fontSize: 12,
  },
  documentActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    padding: 8,
    borderRadius: 8,
  },
  // Empty State
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
  },
});
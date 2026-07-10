import { View, Text, ScrollView, TouchableOpacity, Image, StyleSheet, useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Users, Search, MoreVertical, Star, Shield, Wrench } from 'lucide-react-native';

// Embedded mock team data
const mockTeam = [
  {
    id: '1',
    name: 'John Technician',
    email: 'john.tech@example.com',
    role: 'technician',
    avatar: 'https://i.pravatar.cc/150?u=1',
    stats: {
      jobsToday: 3,
      rating: 4.8,
      jobsCompleted: 127,
      yearsExp: 5,
    }
  },
  {
    id: '2',
    name: 'Jane Admin',
    email: 'jane.admin@example.com',
    role: 'admin',
    avatar: 'https://i.pravatar.cc/150?u=2',
    stats: {
      jobsToday: 0,
      rating: 4.9,
      jobsCompleted: 89,
      yearsExp: 3,
    }
  },
  {
    id: '3',
    name: 'Bob Super',
    email: 'bob.super@example.com',
    role: 'superuser',
    avatar: 'https://i.pravatar.cc/150?u=3',
    stats: {
      jobsToday: 0,
      rating: 5.0,
      jobsCompleted: 245,
      yearsExp: 8,
    }
  },
  {
    id: '4',
    name: 'Sarah Wilson',
    email: 'sarah.w@example.com',
    role: 'technician',
    avatar: 'https://i.pravatar.cc/150?u=4',
    stats: {
      jobsToday: 3,
      rating: 4.9,
      jobsCompleted: 56,
      yearsExp: 2,
    }
  },
  {
    id: '5',
    name: 'Mike Johnson',
    email: 'mike.j@example.com',
    role: 'technician',
    avatar: 'https://i.pravatar.cc/150?u=5',
    stats: {
      jobsToday: 2,
      rating: 4.7,
      jobsCompleted: 92,
      yearsExp: 4,
    }
  },
  {
    id: '6',
    name: 'Emily Davis',
    email: 'emily.d@example.com',
    role: 'technician',
    avatar: 'https://i.pravatar.cc/150?u=6',
    stats: {
      jobsToday: 2,
      rating: 4.8,
      jobsCompleted: 78,
      yearsExp: 3,
    }
  },
];

export default function TeamScreen() {
  const router = useRouter();
  const isDarkMode = useColorScheme() === 'dark';

  const getRoleIcon = (role: string) => {
    switch(role) {
      case 'superuser': return Star;
      case 'admin': return Shield;
      default: return Wrench;
    }
  };

  const getRoleColor = (role: string) => {
    switch(role) {
      case 'superuser': return '#8b5cf6';
      case 'admin': return '#3b82f6';
      default: return '#10b981';
    }
  };

  const getRoleDisplayName = (role: string) => {
    switch(role) {
      case 'superuser': return 'Super';
      case 'admin': return 'Admin';
      default: return 'Tech';
    }
  };

  // Calculate team stats
  const totalMembers = mockTeam.length;
  const totalTechnicians = mockTeam.filter(m => m.role === 'technician').length;

  return (
    <View style={[styles.container, { backgroundColor: isDarkMode ? '#000' : '#f8fafc' }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: isDarkMode ? '#1f2937' : '#fff' }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color={isDarkMode ? '#fff' : '#1e293b'} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: isDarkMode ? '#fff' : '#1e293b' }]}>
          Team Members
        </Text>
        <TouchableOpacity style={styles.searchButton}>
          <Search size={24} color={isDarkMode ? '#fff' : '#1e293b'} />
        </TouchableOpacity>
      </View>

      {/* Team Stats */}
      <View style={styles.statsContainer}>
        <View style={[styles.statCard, { backgroundColor: isDarkMode ? '#1f2937' : '#fff' }]}>
          <Users size={24} color="#3b82f6" />
          <Text style={[styles.statNumber, { color: isDarkMode ? '#fff' : '#1e293b' }]}>
            {totalMembers}
          </Text>
          <Text style={[styles.statLabel, { color: isDarkMode ? '#9ca3af' : '#64748b' }]}>
            Total Members
          </Text>
        </View>
        
        <View style={[styles.statCard, { backgroundColor: isDarkMode ? '#1f2937' : '#fff' }]}>
          <Wrench size={24} color="#10b981" />
          <Text style={[styles.statNumber, { color: isDarkMode ? '#fff' : '#1e293b' }]}>
            {totalTechnicians}
          </Text>
          <Text style={[styles.statLabel, { color: isDarkMode ? '#9ca3af' : '#64748b' }]}>
            Technicians
          </Text>
        </View>
      </View>

      {/* Team List */}
      <ScrollView 
        style={styles.teamList}
        showsVerticalScrollIndicator={true}
        contentContainerStyle={styles.teamListContent}
      >
        <Text style={[styles.sectionTitle, { color: isDarkMode ? '#fff' : '#1e293b' }]}>
          All Members
        </Text>
        
        {mockTeam.map((member) => {
          const RoleIcon = getRoleIcon(member.role);
          const roleColor = getRoleColor(member.role);
          
          return (
            <TouchableOpacity 
              key={member.id}
              style={[styles.memberCard, { backgroundColor: isDarkMode ? '#1f2937' : '#fff' }]}
              onPress={() => router.push(`/(app)/profile/${member.id}` as any)}
            >
              <Image 
                source={{ uri: member.avatar }} 
                style={styles.memberAvatar}
              />
              
              <View style={styles.memberInfo}>
                <View style={styles.memberHeader}>
                  <Text style={[styles.memberName, { color: isDarkMode ? '#fff' : '#1e293b' }]}>
                    {member.name}
                  </Text>
                  <View style={[styles.roleBadge, { backgroundColor: `${roleColor}20` }]}>
                    <RoleIcon size={12} color={roleColor} />
                    <Text style={[styles.roleText, { color: roleColor }]}>
                      {getRoleDisplayName(member.role)}
                    </Text>
                  </View>
                </View>
                
                <Text style={[styles.memberEmail, { color: isDarkMode ? '#9ca3af' : '#64748b' }]}>
                  {member.email}
                </Text>
                
                <View style={styles.memberStats}>
                  <Text style={[styles.memberStat, { color: isDarkMode ? '#d1d5db' : '#334155' }]}>
                    {member.stats.jobsToday} jobs today
                  </Text>
                  <Text style={[styles.memberStat, { color: isDarkMode ? '#d1d5db' : '#334155' }]}>
                    • {member.stats.rating} ⭐
                  </Text>
                </View>
              </View>
              
              <TouchableOpacity style={styles.moreButton}>
                <MoreVertical size={20} color={isDarkMode ? '#9ca3af' : '#64748b'} />
              </TouchableOpacity>
            </TouchableOpacity>
          );
        })}
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
  searchButton: {
    padding: 8,
  },
  statsContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 8,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
  },
  teamList: {
    flex: 1,
    paddingHorizontal: 16,
  },
  teamListContent: {
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  memberAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  memberInfo: {
    flex: 1,
  },
  memberHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  roleText: {
    fontSize: 10,
    fontWeight: '600',
  },
  memberEmail: {
    fontSize: 12,
    marginBottom: 4,
  },
  memberStats: {
    flexDirection: 'row',
    gap: 8,
  },
  memberStat: {
    fontSize: 12,
  },
  moreButton: {
    padding: 4,
  },
});
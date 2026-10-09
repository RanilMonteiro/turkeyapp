import { View, Text, Switch, StyleSheet } from 'react-native';
import {
  PERMISSION_GROUP_LABELS, PERMISSION_GROUP_ORDER,
  Role, permissionsAlwaysOn, permissionsGrantableTo,
} from '../constants/permissions';

// The permissions card shown in Create User and Edit User. Both screens
// used to carry their own copy of the permission list; now they share
// this component and constants/permissions.ts, so a new permission only
// has to be added in one place.

type Props = {
  role: Role;
  selected: string[];
  onToggle: (key: string) => void;
  theme: {
    card: string;
    border: string;
    text: string;
    subtext: string;
    trackOff: string;
    thumbOff: string;
  };
  accent: string;
};

export default function PermissionToggles({ role, selected, onToggle, theme, accent }: Props) {
  const grantable = permissionsGrantableTo(role);
  const alwaysOn = permissionsAlwaysOn(role);

  if (role === 'superuser') return null; // superuser always has everything

  const roleName = role === 'hr' ? 'HR user' : role === 'admin' ? 'admin' : 'technician';

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Text style={[styles.title, { color: theme.text }]}>Permissions</Text>
      <Text style={[styles.subtitle, { color: theme.subtext }]}>
        Switch off anything this {roleName} should not see. Switched-off items disappear from their dashboard and sidebar, and the screen is blocked.
      </Text>

      {alwaysOn.length > 0 && (
        <Text style={[styles.alwaysOn, { color: theme.subtext }]}>
          Included automatically for this role: {alwaysOn.map(p => p.label).join(', ')}.
        </Text>
      )}

      {grantable.length === 0 && (
        <Text style={[styles.subtitle, { color: theme.subtext }]}>
          There are no extra permissions to set for this role.
        </Text>
      )}

      {PERMISSION_GROUP_ORDER.map(group => {
        const items = grantable.filter(p => p.group === group);
        if (items.length === 0) return null;
        return (
          <View key={group}>
            <Text style={[styles.groupLabel, { color: theme.subtext }]}>
              {PERMISSION_GROUP_LABELS[group].toUpperCase()}
            </Text>
            {items.map(perm => {
              const on = selected.includes(perm.key);
              // Dependent switches (e.g. "Edit sites") are locked until
              // their parent switch ("Sites") is on.
              const locked = !!perm.requires && !selected.includes(perm.requires);
              return (
                <View
                  key={perm.key}
                  style={[styles.row, { borderBottomColor: theme.border }, locked && { opacity: 0.45 }]}
                >
                  <View style={styles.info}>
                    <Text style={[styles.label, { color: theme.text }]}>{perm.label}</Text>
                    <Text style={[styles.desc, { color: theme.subtext }]}>
                      {locked ? 'Switch on the item above first. ' : ''}{perm.description}
                    </Text>
                  </View>
                  <Switch
                    value={on && !locked}
                    disabled={locked}
                    onValueChange={() => onToggle(perm.key)}
                    trackColor={{ false: theme.trackOff, true: `${accent}80` }}
                    thumbColor={on ? accent : theme.thumbOff}
                  />
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    margin: 16,
    marginBottom: 0,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
  },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  subtitle: { fontSize: 13, lineHeight: 18, marginBottom: 12 },
  alwaysOn: { fontSize: 12, lineHeight: 17, marginBottom: 8, fontStyle: 'italic' },
  groupLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 14,
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  info: { flex: 1 },
  label: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  desc: { fontSize: 12, lineHeight: 17 },
});

import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Alert
} from 'react-native';

const BACKEND_URL = 'http://localhost:5000';

interface TriageData {
  category: string;
  priority: string;
  confidence: number;
  answer: string;
  citations: string[];
  escalated: string;
  escalation_team?: string;
  pii_masked: string;
  follow_up_question?: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'triage' | 'approvals'>('triage');
  const [inputText, setInputText] = useState('');
  const [role, setRole] = useState<'Cashier' | 'Store Manager' | 'Inventory Associate'>('Cashier');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TriageData | null>(null);
  const [approvals, setApprovals] = useState<any[]>([]);

  useEffect(() => {
    loadApprovals();
  }, []);

  const loadApprovals = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/actions/outbox`);
      if (res.ok) {
        const data = await res.json();
        setApprovals(data.outbox || []);
      }
    } catch (e) {
      console.log('Mobile app: backend not reached on localhost:5000');
    }
  };

  const handleTriage = async (text?: string) => {
    const prompt = text || inputText;
    if (!prompt.trim() || loading) return;

    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/triage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issue_text: prompt,
          persona: role,
          store_id: 'ST001'
        })
      });

      if (res.ok) {
        const data: TriageData = await res.json();
        setResult(data);
        loadApprovals();
      } else {
        throw new Error('API Error');
      }
    } catch (e) {
      // Offline fallback demo
      setResult({
        category: 'POS and Payments',
        priority: 'P3',
        confidence: 0.92,
        answer: 'Checked register error locally: inspect cable connection and perform soft reboot on PIN pad. Route customers to register 3 [02_pos_pricing_returns_policy.md#pos-card-reader-runbook].',
        citations: ['02_pos_pricing_returns_policy.md#pos-card-reader-runbook'],
        escalated: 'No',
        pii_masked: 'No',
        follow_up_question: 'Did the device reboot clear Error 51?'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: number, status: string) => {
    try {
      await fetch(`${BACKEND_URL}/api/v1/actions/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status })
      });
      loadApprovals();
      Alert.alert('Action Updated', `Outbox ticket #${id} marked as ${status}.`);
    } catch (e) {
      Alert.alert('Error', 'Could not update approval status.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#090d16" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Text style={styles.logoIcon}>🏏</Text>
          <View>
            <Text style={styles.headerTitle}>Punjab Sports Mart</Text>
            <Text style={styles.headerSubtitle}>Store Associate Mobile Assistant</Text>
          </View>
        </View>
        <View style={styles.storeBadge}>
          <Text style={styles.storeBadgeText}>ST001 (Jalandhar)</Text>
        </View>
      </View>

      {/* Role Picker */}
      <View style={styles.roleContainer}>
        {(['Cashier', 'Store Manager', 'Inventory Associate'] as const).map(r => (
          <TouchableOpacity
            key={r}
            style={[styles.roleButton, role === r && styles.roleButtonActive]}
            onPress={() => setRole(r)}
          >
            <Text style={[styles.roleText, role === r && styles.roleTextActive]}>{r}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab Switcher */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'triage' && styles.tabButtonActive]}
          onPress={() => setActiveTab('triage')}
        >
          <Text style={[styles.tabText, activeTab === 'triage' && styles.tabTextActive]}>
            Issue Triage
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'approvals' && styles.tabButtonActive]}
          onPress={() => setActiveTab('approvals')}
        >
          <Text style={[styles.tabText, activeTab === 'approvals' && styles.tabTextActive]}>
            Approvals ({approvals.filter(a => a.status === 'PENDING_APPROVAL').length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {activeTab === 'triage' ? (
          <>
            {/* Quick Action Chips */}
            <Text style={styles.sectionTitle}>QUICK OPS SHORTCUTS</Text>
            <View style={styles.chipsRow}>
              <TouchableOpacity
                style={styles.chip}
                onPress={() => {
                  setInputText('Card reader on register 4 is showing error 51.');
                  handleTriage('Card reader on register 4 is showing error 51.');
                }}
              >
                <Text style={styles.chipText}>💳 Register 4 Error 51</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.chip}
                onPress={() => {
                  setInputText('English Willow Cricket Bat is out of stock again at Store ST002.');
                  handleTriage('English Willow Cricket Bat is out of stock again at Store ST002.');
                }}
              >
                <Text style={styles.chipText}>🏏 Bat Out of Stock</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.chip}
                onPress={() => {
                  setInputText('Customer wants to return treadmill without receipt for INR 24999.');
                  handleTriage('Customer wants to return treadmill without receipt for INR 24999.');
                }}
              >
                <Text style={styles.chipText}>📦 No-Receipt Return</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.chip}
                onPress={() => {
                  setInputText('We have split football seams at two stores.');
                  handleTriage('We have split football seams at two stores.');
                }}
              >
                <Text style={styles.chipText}>⚽ Split Seams Defect</Text>
              </TouchableOpacity>
            </View>

            {/* Input Box */}
            <View style={styles.inputCard}>
              <TextInput
                style={styles.input}
                placeholder="Describe store operational issue..."
                placeholderTextColor="#64748b"
                value={inputText}
                onChangeText={setInputText}
                multiline
              />
              <TouchableOpacity
                style={styles.submitBtn}
                onPress={() => handleTriage()}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.submitBtnText}>Ask Copilot ↵</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Result Display */}
            {result && (
              <View style={styles.resultCard}>
                <View style={styles.badgeRow}>
                  <View style={styles.catBadge}>
                    <Text style={styles.catBadgeText}>{result.category}</Text>
                  </View>
                  <View style={[
                    styles.priorityBadge,
                    result.priority === 'P1' ? styles.p1 :
                    result.priority === 'P2' ? styles.p2 : styles.p3
                  ]}>
                    <Text style={styles.priorityText}>{result.priority}</Text>
                  </View>
                </View>

                <Text style={styles.answerText}>{result.answer}</Text>

                {result.citations && result.citations.length > 0 && (
                  <View style={styles.citationsBox}>
                    <Text style={styles.metaLabel}>POLICIES CITED:</Text>
                    {result.citations.map((c, i) => (
                      <Text key={i} style={styles.citationText}>📖 {c}</Text>
                    ))}
                  </View>
                )}

                {result.escalated === 'Yes' && (
                  <View style={styles.escalationBox}>
                    <Text style={styles.escalationTitle}>🚨 Escalated to {result.escalation_team}</Text>
                  </View>
                )}

                {result.follow_up_question && (
                  <TouchableOpacity
                    style={styles.followUpBox}
                    onPress={() => handleTriage(result.follow_up_question)}
                  >
                    <Text style={styles.followUpText}>💡 {result.follow_up_question}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </>
        ) : (
          /* Manager Approvals Tab */
          <View style={styles.approvalsList}>
            <Text style={styles.sectionTitle}>PENDING STORE OUTBOX APPROVALS</Text>
            {approvals.length === 0 ? (
              <Text style={styles.emptyText}>No pending approval items in queue.</Text>
            ) : (
              approvals.map((item, idx) => (
                <View key={idx} style={styles.approvalCard}>
                  <View style={styles.approvalHeader}>
                    <Text style={styles.actionType}>{item.action_type}</Text>
                    <Text style={[styles.priorityBadge, item.priority === 'P1' ? styles.p1 : styles.p2]}>
                      {item.priority}
                    </Text>
                  </View>
                  <Text style={styles.teamText}>Team: {item.team}</Text>
                  <Text style={styles.statusText}>Status: {item.status}</Text>

                  {item.status === 'PENDING_APPROVAL' && (
                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        style={styles.approveBtn}
                        onPress={() => handleApprove(item.id, 'SUBMITTED')}
                      >
                        <Text style={styles.btnText}>Approve</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.rejectBtn}
                        onPress={() => handleApprove(item.id, 'REJECTED')}
                      >
                        <Text style={styles.btnText}>Reject</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090d16',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0f172a',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoIcon: {
    fontSize: 26,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#f8fafc',
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#94a3b8',
  },
  storeBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  storeBadgeText: {
    color: '#34d399',
    fontSize: 11,
    fontWeight: '700',
  },
  roleContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  roleButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  roleButtonActive: {
    backgroundColor: '#10b981',
  },
  roleText: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '600',
  },
  roleTextActive: {
    color: '#fff',
    fontWeight: '800',
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabButtonActive: {
    borderBottomWidth: 2,
    borderColor: '#10b981',
  },
  tabText: {
    fontSize: 13,
    color: '#94a3b8',
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#fff',
  },
  scrollContent: {
    padding: 16,
    gap: 14,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 0.5,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  chipText: {
    color: '#e2e8f0',
    fontSize: 12,
  },
  inputCard: {
    backgroundColor: 'rgba(17, 24, 39, 0.85)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 10,
  },
  input: {
    color: '#fff',
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  submitBtn: {
    backgroundColor: '#10b981',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  resultCard: {
    backgroundColor: 'rgba(17, 24, 39, 0.95)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    gap: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  catBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  catBadgeText: {
    color: '#34d399',
    fontSize: 11,
    fontWeight: '700',
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  p1: { backgroundColor: 'rgba(239, 68, 68, 0.2)' },
  p2: { backgroundColor: 'rgba(245, 158, 11, 0.2)' },
  p3: { backgroundColor: 'rgba(59, 130, 246, 0.2)' },
  priorityText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  answerText: {
    color: '#f8fafc',
    fontSize: 14,
    lineHeight: 20,
  },
  citationsBox: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    padding: 10,
    borderRadius: 8,
    gap: 4,
  },
  metaLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
  },
  citationText: {
    fontSize: 11,
    color: '#6ee7b7',
    fontFamily: 'monospace',
  },
  escalationBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  escalationTitle: {
    color: '#fca5a5',
    fontWeight: '700',
    fontSize: 12,
  },
  followUpBox: {
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingTop: 8,
  },
  followUpText: {
    color: '#93c5fd',
    fontSize: 12,
  },
  approvalsList: {
    gap: 12,
  },
  approvalCard: {
    backgroundColor: 'rgba(17, 24, 39, 0.85)',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 6,
  },
  approvalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionType: {
    fontSize: 13,
    fontWeight: '700',
    color: '#f8fafc',
  },
  teamText: {
    fontSize: 12,
    color: '#94a3b8',
  },
  statusText: {
    fontSize: 12,
    color: '#fcd34d',
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  approveBtn: {
    flex: 1,
    backgroundColor: '#10b981',
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  rejectBtn: {
    flex: 1,
    backgroundColor: '#ef4444',
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  btnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyText: {
    color: '#64748b',
    textAlign: 'center',
    marginTop: 30,
    fontSize: 13,
  },
});

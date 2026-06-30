import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, ScrollView, Modal, Switch,
  RefreshControl, StatusBar, Platform, Linking
} from 'react-native';
import * as Location from 'expo-location';

import { startTracking, stopTracking, isTracking } from '../services/location';
import {
  logVisit, getVisits, logDelivery, getDeliveries,
  getNotPaidInvoices, requestPayment, removeToken
} from '../services/api';

let Notifications = null;
try {
  Notifications = require('expo-notifications');
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
} catch (e) {
  console.log('expo-notifications not available');
}

if (Notifications) {
  Notifications.setNotificationCategoryAsync('work-reminder', [
    { identifier: 'DISMISS', buttonTitle: 'OK, stop reminders today', options: { isDestructive: true } },
  ]);
}

const C = {
  red: '#C0392B', redD: '#A93226', redL: '#FADBD8',
  navy: '#2C3E50', green: '#27AE60', greenL: '#D5F5E3',
  amber: '#F39C12', amberL: '#FDEBD0', destroy: '#EA4335',
  bg: '#F4F5F7', white: '#FFFFFF',
  t1: '#1A252F', t2: '#5D6D7E', t3: '#AAB7C4',
  trackStart: '#27AE60',   // green before started
  trackActive: '#C0392B',  // red when active
};

const SALESMAN_COLORS = ['#8E44AD','#2980B9','#16A085','#D35400','#1A5276','#7D6608'];

const shadow = {
  shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.07, shadowRadius: 10, elevation: 3,
};

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Good night';
}

function formatDate(ts) {
  if (!ts) return '';
  // Convert to Oman time (UTC+4)
  const d = new Date(new Date(ts).getTime() + (4 * 60 * 60 * 1000));
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const hh = d.getUTCHours().toString().padStart(2,'0');
  const mm = d.getUTCMinutes().toString().padStart(2,'0');
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]}, ${hh}:${mm}`;
}

const FILTERS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'older', label: 'Older' },
];

export default function SalesmanDashboard({ route, navigation }) {
  const { name } = route.params || {};
  const [activeTab, setActiveTab] = useState('home');
  const [tracking, setTracking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [visits, setVisits] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [notPaid, setNotPaid] = useState([]);
  const [visitFilter, setVisitFilter] = useState('today');
  const [deliveryFilter, setDeliveryFilter] = useState('today');
  const [visitSearch, setVisitSearch] = useState('');
  const [deliverySearch, setDeliverySearch] = useState('');
  const [notPaidSearch, setNotPaidSearch] = useState('');

  // Visit modal
  const [visitModal, setVisitModal] = useState(false);
  const [company, setCompany] = useState('');
  const [contactName, setContactName] = useState('');
  const [mobile, setMobile] = useState('');
  const [emailId, setEmailId] = useState('');
  const [quotation, setQuotation] = useState(false);
  const [quotationDesc, setQuotationDesc] = useState('');
  const [vLoading, setVLoading] = useState(false);

  // Delivery modal
  const [deliveryModal, setDeliveryModal] = useState(false);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [deliveredPerson, setDeliveredPerson] = useState('');
  const [payType, setPayType] = useState('cash');
  const [cashType, setCashType] = useState('cash');
  const [dLoading, setDLoading] = useState(false);

  // Payment modal
  const [payModal, setPayModal] = useState(false);
  const [selectedInv, setSelectedInv] = useState(null);
  const [newPayType, setNewPayType] = useState('cash');
  const [newCashType, setNewCashType] = useState('cash');

  const notifIntervalRef = useRef(null);
  const dismissedTodayRef = useRef(false);

  useEffect(() => { loadVisits(); }, [visitFilter]);
  useEffect(() => { loadDeliveries(); }, [deliveryFilter]);

  useEffect(() => {
  checkTracking();
  loadAll();
  setupNotifications();
  const sub = Notifications?.addNotificationResponseReceivedListener?.((resp) => {
    if (resp.actionIdentifier === 'DISMISS') {
      dismissedTodayRef.current = true;
    }
  });
  return () => { clearNotifInterval(); sub?.remove(); };
}, []);

  // ── Notifications ─────────────────────────────────────────────
const setupNotifications = async () => {
    if (!Notifications) return;
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') return;
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.HIGH,
        });
      }
      scheduleWorkReminderCheck();
    } catch (e) {
      console.log('Notification setup failed:', e.message);
    }
};

  const scheduleWorkReminderCheck = () => {
    if (!Notifications) return;
    const iv = setInterval(async () => {
      try {
const utcNow = new Date();
const omanMs = utcNow.getTime() + (4 * 60 * 60 * 1000);
const oman = new Date(omanMs);
const day = oman.getUTCDay();   // 5 = Friday
const h = oman.getUTCHours();
const m = oman.getUTCMinutes();
const active = await isTracking();
if (day !== 5 && h === 9 && m % 15 === 0 && !active && !dismissedTodayRef.current) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: 'Al Sahal · Work Started?',
              body: 'Don\'t forget to mark your work as started for today!',
              sound: true,
              categoryIdentifier: 'work-reminder',
            },
            trigger: null,
          });
        }
      } catch (e) {
        console.log('Notification error:', e.message);
      }
    }, 60000);
    notifIntervalRef.current = iv;
  };

  const clearNotifInterval = () => {
    if (notifIntervalRef.current) clearInterval(notifIntervalRef.current);
  };

  // ── Data loading ───────────────────────────────────────────────
  const checkTracking = async () => {
    const active = await isTracking();
    setTracking(active);
  };

  const loadAll = async () => {
    await Promise.all([loadVisits(), loadDeliveries(), loadNotPaid()]);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  };

  const loadVisits = async () => {
    try {
      const data = await getVisits(visitFilter);
      setVisits(data);
    } catch (e) { console.log('loadVisits error:', e?.response?.data || e.message); }
  };

  const loadDeliveries = async () => {
    try {
      const data = await getDeliveries(deliveryFilter);
      setDeliveries(data);
    } catch (e) { console.log('loadDeliveries error:', e?.response?.data || e.message); }
  };

  const loadNotPaid = async () => {
    try {
      const data = await getNotPaidInvoices();
      setNotPaid(data);
    } catch (e) { console.log('loadNotPaid error:', e?.response?.data || e.message); }
  };

  // ── Tracking ───────────────────────────────────────────────────
  const toggleTracking = async () => {
    if (tracking) {
      Alert.alert('Stop Work', 'Mark your work as stopped?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Stop', style: 'destructive', onPress: async () => {
            await stopTracking();
            setTracking(false);
          }
        }
      ]);
    } else {
      const started = await startTracking();
      setTracking(started);
      if (!started) Alert.alert('Permission needed', 'Allow location access in Settings.');
    }
  };

  // ── Visit log ──────────────────────────────────────────────────
  const handleLogVisit = async () => {
    if (!company || !contactName || !mobile)
      return Alert.alert('Required fields missing', 'Company name, contact name and mobile are required.');
    if (quotation && !quotationDesc)
      return Alert.alert('Required', 'Please fill in the quotation details.');
    setVLoading(true);
    try {
      // Get current location to save with visit
      let lat = null; let lng = null;
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        lat = loc.coords.latitude;
        lng = loc.coords.longitude;
      }
      await logVisit({
        company_name: company, contact_name: contactName,
        mobile, email_id: emailId, quotation,
        quotation_description: quotationDesc, lat, lng
      });
      setVisitModal(false);
      resetVisitForm();
      loadVisits();
    } catch (e) {
      console.log('logVisit error:', e?.response?.data || e.message);
      Alert.alert('Error', 'Failed to save visit');
    } finally { setVLoading(false); }
  };

  const resetVisitForm = () => {
    setCompany(''); setContactName(''); setMobile('');
    setEmailId(''); setQuotation(false); setQuotationDesc('');
  };

  // ── Delivery log ───────────────────────────────────────────────
  const resolvedPaymentMethod = (pt, ct) => {
    if (pt === 'cash') return ct; // 'cash' or 'bank'
    return pt;
  };

const handleLogDelivery = async () => {
    if (!invoiceNo.trim() || !deliveredPerson.trim())
      return Alert.alert('Required', 'Invoice number and delivered person are required.');
    const pm = resolvedPaymentMethod(payType, cashType);
    setDLoading(true);
    try {
      // Get current location to save with delivery
      let lat = null; let lng = null;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          lat = loc.coords.latitude;
          lng = loc.coords.longitude;
        }
      } catch (locErr) {
        console.log('Location error:', locErr.message);
      }

      await logDelivery({
        invoice_number: invoiceNo.trim(),
        delivered_person: deliveredPerson.trim(),
        payment_method: pm,
        lat,
        lng
      });
      setDeliveryModal(false);
      setInvoiceNo(''); setDeliveredPerson('');
      setPayType('cash'); setCashType('cash');
      await loadDeliveries();
      await loadNotPaid();
      Alert.alert('Saved', 'Delivery logged successfully.');
    } catch (e) {
      console.log('logDelivery error:', e?.response?.data || e.message);
      Alert.alert('Error', e?.response?.data?.error || 'Failed to save delivery');
    } finally { setDLoading(false); }
  };

  // ── Payment request ────────────────────────────────────────────
  const handleRequestPayment = async () => {
    const pm = resolvedPaymentMethod(newPayType, newCashType);
    try {
      await requestPayment(selectedInv.id, pm);
      setNotPaid(prev => prev.map(inv =>
        inv.id === selectedInv.id
          ? { ...inv, status: 'pending_approval', payment_method: pm }
          : inv
      ));
      setPayModal(false);
    } catch (e) { Alert.alert('Error', 'Failed to submit payment request'); }
  };

  const handleLogout = async () => {
    Alert.alert('Sign out', 'Your work tracker will keep running until you stop it.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive', onPress: async () => {
          clearNotifInterval();
          await removeToken();
          navigation.replace('Login');
        }
      }
    ]);
  };

  // ── Search helper ──────────────────────────────────────────────
  const searchFilter = (list, term, keys) => {
    if (!term.trim()) return list;
    const t = term.toLowerCase();
    return list.filter(item => keys.some(k => (item[k] || '').toLowerCase().includes(t)));
  };

  const filteredVisits = searchFilter(visits, visitSearch, ['company_name','contact_name','mobile','email_id']);
  const filteredDeliveries = searchFilter(deliveries, deliverySearch, ['invoice_number','delivered_person','payment_method']);
  const filteredNotPaid = searchFilter(notPaid, notPaidSearch, ['invoice_number','delivered_person']);

  // ── Sub-components ─────────────────────────────────────────────
  const PayTypeSelector = ({ type, setType, cashT, setCashT }) => (
    <View>
      <View style={styles.payRow}>
        {[['cash','Cash'],['credit','Credit'],['not_paid','Not Paid']].map(([val,lbl]) => (
          <TouchableOpacity key={val}
            style={[styles.payOpt, type===val && styles.payOptSel]}
            onPress={() => setType(val)}>
            <Text style={[styles.payOptTxt, type===val && styles.payOptTxtSel]}>{lbl}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {type === 'cash' && (
        <View style={[styles.payRow, { marginTop: 8 }]}>
          {[['cash','Cash'],['bank','Bank Transfer']].map(([val,lbl]) => (
            <TouchableOpacity key={val}
              style={[styles.payOpt, cashT===val && styles.payOptSel]}
              onPress={() => setCashT(val)}>
              <Text style={[styles.payOptTxt, cashT===val && styles.payOptTxtSel]}>{lbl}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );

  const FilterBar = ({ selected, onSelect }) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      style={styles.filterScroll} contentContainerStyle={{ paddingRight: 8 }}>
      {FILTERS.map(f => (
        <TouchableOpacity key={f.key}
          style={[styles.filterPill, selected===f.key && styles.filterPillOn]}
          onPress={() => onSelect(f.key)}>
          <Text style={[styles.filterPillTxt, selected===f.key && styles.filterPillTxtOn]}>{f.label}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  const SearchBar = ({ value, onChange, placeholder }) => (
    <View style={styles.searchBar}>
      <Text style={styles.searchIcon}>🔍</Text>
      <TextInput
        style={styles.searchInput}
        placeholder={placeholder || 'Search…'}
        placeholderTextColor={C.t3}
        value={value}
        onChangeText={onChange}
        clearButtonMode="while-editing"
      />
    </View>
  );

  const openVisitLocation = (lat, lng, company) => {
    if (!lat || !lng) return Alert.alert('No location', 'No location was saved for this visit.');
    Linking.openURL(`https://www.google.com/maps?q=${lat},${lng}&label=${company}`);
  };

  // ── Tab screens ────────────────────────────────────────────────
  const HomeTab = () => (
    <ScrollView style={styles.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      {/* Work status card */}
      <View style={[styles.card, { padding: 20, alignItems: 'center' }]}>
        <Text style={styles.sectionLabel}>WORK STATUS</Text>
        <TouchableOpacity
          style={[styles.trackPill, { backgroundColor: tracking ? C.trackActive : C.trackStart }]}
          onPress={toggleTracking}
          activeOpacity={0.85}>
          <View style={styles.trackDot} />
          <Text style={styles.trackPillTxt}>
            {tracking ? 'Work Started  —  Tap to Stop' : 'Start Work'}
          </Text>
        </TouchableOpacity>
        <Text style={[styles.trackHint, { color: tracking ? C.red : C.green }]}>
          {tracking ? 'You are currently active' : 'Tap to mark yourself as started'}
        </Text>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={[styles.statVal, { color: C.navy }]}>{visits.length}</Text>
          <Text style={styles.statLbl}>Visits</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statVal, { color: C.red }]}>
            {notPaid.filter(i => i.status === 'not_paid').length}
          </Text>
          <Text style={styles.statLbl}>Not Paid</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statVal, { color: C.green }]}>{deliveries.length}</Text>
          <Text style={styles.statLbl}>Deliveries</Text>
        </View>
      </View>

      <Text style={styles.sectionLabel}>RECENT ACTIVITY</Text>
      {visits.slice(0, 3).map((v, i) => (
        <VisitCard key={v.id} v={v} color={SALESMAN_COLORS[i % SALESMAN_COLORS.length]}
          onLocPress={() => openVisitLocation(v.lat, v.lng, v.company_name)} />
      ))}
      {visits.length === 0 && <Text style={styles.empty}>No visits today</Text>}
      <View style={{ height: 20 }} />
    </ScrollView>
  );

  const VisitsTab = () => (
    <>
      <FilterBar selected={visitFilter} onSelect={setVisitFilter} />
      <View style={{ paddingHorizontal: 14, paddingBottom: 6 }}>
        <SearchBar value={visitSearch} onChange={setVisitSearch}
          placeholder="Search company, contact, mobile…" />
      </View>
      <ScrollView style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <Text style={styles.resultCount}>{filteredVisits.length} visit{filteredVisits.length !== 1 ? 's' : ''}</Text>
        {filteredVisits.map((v, i) => (
          <VisitCard key={v.id} v={v} color={SALESMAN_COLORS[i % SALESMAN_COLORS.length]}
            onLocPress={() => openVisitLocation(v.lat, v.lng, v.company_name)} />
        ))}
        {filteredVisits.length === 0 && <Text style={styles.empty}>No visits found</Text>}
        <View style={{ height: 80 }} />
      </ScrollView>
      <TouchableOpacity style={styles.fab} onPress={() => setVisitModal(true)}>
        <Text style={styles.fabTxt}>+</Text>
      </TouchableOpacity>
    </>
  );

  const DeliveryTab = () => (
    <>
      <FilterBar selected={deliveryFilter} onSelect={setDeliveryFilter} />
      <View style={{ paddingHorizontal: 14, paddingBottom: 6 }}>
        <SearchBar value={deliverySearch} onChange={setDeliverySearch}
          placeholder="Search invoice, recipient…" />
      </View>
      <ScrollView style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <Text style={styles.resultCount}>{filteredDeliveries.length} delivery records</Text>
        {filteredDeliveries.map((d, i) => (
          <DeliveryCard key={d.id} d={d} color={SALESMAN_COLORS[i % SALESMAN_COLORS.length]} />
        ))}
        {filteredDeliveries.length === 0 && <Text style={styles.empty}>No deliveries found</Text>}
        <View style={{ height: 80 }} />
      </ScrollView>
      <TouchableOpacity style={styles.fab} onPress={() => setDeliveryModal(true)}>
        <Text style={styles.fabTxt}>+</Text>
      </TouchableOpacity>
    </>
  );

  const NotPaidTab = () => (
    <>
      <View style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6 }}>
        <SearchBar value={notPaidSearch} onChange={setNotPaidSearch}
          placeholder="Search invoice, company…" />
      </View>
      <ScrollView style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <Text style={styles.resultCount}>
          {filteredNotPaid.length} unpaid invoice{filteredNotPaid.length !== 1 ? 's' : ''}
        </Text>
        {filteredNotPaid.map((inv) => {
          const isPending = inv.status === 'pending_approval';
          return (
            <View key={inv.id} style={[styles.card, styles.cardLeft,
              { borderLeftColor: isPending ? C.amber : C.red }]}>
              <Text style={styles.cardTitle}>{inv.invoice_number}</Text>
              <Text style={styles.cardDetail}>Delivered to: {inv.delivered_person}</Text>
              <Text style={styles.cardTime}>{formatDate(inv.created_at)}</Text>
              <View style={[styles.badge,
                { backgroundColor: isPending ? C.amberL : C.redL, marginTop: 8 }]}>
                <Text style={[styles.badgeTxt, { color: isPending ? '#784212' : C.redD }]}>
                  {isPending ? '⏳ Waiting for admin approval' : '✗ Not Paid'}
                </Text>
              </View>
              {!isPending && (
                <TouchableOpacity style={styles.markPaidBtn}
                  onPress={() => {
                    setSelectedInv(inv);
                    setNewPayType('cash'); setNewCashType('cash');
                    setPayModal(true);
                  }}>
                  <Text style={styles.markPaidTxt}>Mark as Paid</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
        {filteredNotPaid.length === 0 && <Text style={styles.empty}>No unpaid invoices 🎉</Text>}
        <View style={{ height: 20 }} />
      </ScrollView>
    </>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={C.white} />

      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>{getGreeting()}, {name ? name.split(' ')[0] : 'there'} 👋</Text>
          <Text style={styles.headerSub}>Al Sahal · Salesman</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutTxt}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flex: 1 }}>
        {activeTab === 'home' && <HomeTab />}
        {activeTab === 'visits' && <VisitsTab />}
        {activeTab === 'delivery' && <DeliveryTab />}
        {activeTab === 'notpaid' && <NotPaidTab />}
      </View>

      {/* Bottom tab bar */}
      <View style={styles.tabBar}>
        {[
          { key: 'home', label: 'Home', icon: '🏠' },
          { key: 'visits', label: 'Visits', icon: '📍' },
          { key: 'delivery', label: 'Delivery', icon: '🚚' },
          { key: 'notpaid', label: 'Not Paid', icon: '🧾' },
        ].map(t => (
          <TouchableOpacity key={t.key} style={styles.tabItem} onPress={() => setActiveTab(t.key)}>
            <Text style={styles.tabIcon}>{t.icon}</Text>
            <Text style={[styles.tabLabel, activeTab === t.key && styles.tabLabelOn]}>{t.label}</Text>
            {activeTab === t.key && <View style={styles.tabIndicator} />}
          </TouchableOpacity>
        ))}
      </View>

      {/* Visit Modal */}
      <Modal visible={visitModal} animationType="slide" transparent>
        <View style={styles.overlay}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={styles.sheet}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>New Visit Log</Text>

              <Text style={styles.label}>Company Name <Text style={styles.req}>*</Text></Text>
              <TextInput style={styles.input} placeholder="Company name"
                placeholderTextColor={C.t3} value={company} onChangeText={setCompany} />

              <Text style={styles.label}>Contact Name <Text style={styles.req}>*</Text></Text>
              <TextInput style={styles.input} placeholder="Contact person"
                placeholderTextColor={C.t3} value={contactName} onChangeText={setContactName} />

              <Text style={styles.label}>Mobile <Text style={styles.req}>*</Text></Text>
              <TextInput style={styles.input} placeholder="+968 XXXX XXXX"
                placeholderTextColor={C.t3} value={mobile} onChangeText={setMobile}
                keyboardType="phone-pad" />

              <Text style={styles.label}>Email ID</Text>
              <TextInput style={styles.input} placeholder="Optional"
                placeholderTextColor={C.t3} value={emailId} onChangeText={setEmailId}
                keyboardType="email-address" autoCapitalize="none" />

              <View style={styles.switchRow}>
                <Text style={styles.label}>Quotation Required?</Text>
                <Switch value={quotation} onValueChange={setQuotation}
                  trackColor={{ true: C.green, false: '#DDD' }} thumbColor="#fff" />
              </View>

              {quotation && (
                <>
                  <Text style={styles.label}>Quotation Details <Text style={styles.req}>*</Text></Text>
                  <TextInput
                    style={[styles.input, { height: 80, textAlignVertical: 'top', paddingTop: 12 }]}
                    placeholder="Describe the quotation…" placeholderTextColor={C.t3}
                    value={quotationDesc} onChangeText={setQuotationDesc} multiline />
                </>
              )}

              <View style={styles.infoBox}>
                <Text style={styles.infoTxt}>
                  Your current location will be saved with this visit log.
                </Text>
              </View>

              <TouchableOpacity style={styles.submitBtn} onPress={handleLogVisit} disabled={vLoading}>
                {vLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitTxt}>Save Visit</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn}
                onPress={() => { setVisitModal(false); resetVisitForm(); }}>
                <Text style={styles.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Delivery Modal */}
      <Modal visible={deliveryModal} animationType="slide" transparent>
        <View style={styles.overlay}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={styles.sheet}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>New Delivery Log</Text>

              <Text style={styles.label}>Invoice Number <Text style={styles.req}>*</Text></Text>
              <TextInput style={styles.input} placeholder="INV-2025-XXXX"
                placeholderTextColor={C.t3} value={invoiceNo} onChangeText={setInvoiceNo} />

              <Text style={styles.label}>Delivered To <Text style={styles.req}>*</Text></Text>
              <TextInput style={styles.input} placeholder="Person name"
                placeholderTextColor={C.t3} value={deliveredPerson}
                onChangeText={setDeliveredPerson} />

              <Text style={styles.label}>Payment Method <Text style={styles.req}>*</Text></Text>
              <PayTypeSelector type={payType} setType={setPayType}
                cashT={cashType} setCashT={setCashType} />

              <View style={styles.infoBox}>
                <Text style={styles.infoTxt}>Your current location will be saved with this delivery.</Text>
              </View>
              <TouchableOpacity style={[styles.submitBtn, { marginTop: 12 }]}
                onPress={handleLogDelivery} disabled={dLoading}>
                {dLoading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.submitTxt}>Save Delivery</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setDeliveryModal(false)}>
                <Text style={styles.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Mark as Paid Modal */}
      <Modal visible={payModal} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Mark as Paid</Text>
            <Text style={styles.sheetSub}>{selectedInv?.invoice_number}</Text>

            <Text style={styles.label}>Payment Method <Text style={styles.req}>*</Text></Text>
            <PayTypeSelector type={newPayType} setType={setNewPayType}
              cashT={newCashType} setCashT={setNewCashType} />

            <View style={styles.infoBox}>
              <Text style={styles.infoTxt}>
                Invoice stays in Not Paid until admin approves.
              </Text>
            </View>

            <TouchableOpacity style={[styles.submitBtn, { marginTop: 12 }]}
              onPress={handleRequestPayment}>
              <Text style={styles.submitTxt}>Submit for Approval</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setPayModal(false)}>
              <Text style={styles.cancelTxt}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Card components ────────────────────────────────────────────────
function VisitCard({ v, color, onLocPress }) {
  return (
    <View style={[styles.card, styles.cardLeft, { borderLeftColor: color }]}>
      <Text style={styles.cardTitle}>{v.company_name}</Text>
      <Text style={styles.cardDetail}>{v.contact_name}  ·  {v.mobile}</Text>
      {v.email_id ? <Text style={styles.cardDetail}>{v.email_id}</Text> : null}
      {v.quotation ? (
        <View style={[styles.badge, { backgroundColor: '#EAF0FB', marginTop: 6 }]}>
          <Text style={[styles.badgeTxt, { color: '#1A5276' }]}>Quotation sent</Text>
        </View>
      ) : null}
      {v.lat && v.lng ? (
        <TouchableOpacity onPress={onLocPress} style={styles.locBtn}>
          <Text style={styles.locBtnTxt}>📍 View visit location</Text>
        </TouchableOpacity>
      ) : null}
      <Text style={styles.cardTime}>{formatDate(v.visited_at)}</Text>
    </View>
  );
}

function DeliveryCard({ d, color }) {
  const sc = d.status === 'paid'
    ? { bg: '#D5F5E3', txt: '#145A32', lbl: '✓ Paid' }
    : d.status === 'pending_approval'
    ? { bg: '#FDEBD0', txt: '#784212', lbl: '⏳ Pending approval' }
    : { bg: '#FADBD8', txt: '#922B21', lbl: '✗ Not Paid' };
  const pmLabel = d.payment_method === 'bank' ? 'Bank Transfer'
    : d.payment_method === 'not_paid' ? 'Not Paid'
    : d.payment_method
      ? d.payment_method.charAt(0).toUpperCase() + d.payment_method.slice(1)
      : '—';
  return (
    <View style={[styles.card, styles.cardLeft, { borderLeftColor: color }]}>
      <Text style={styles.cardTitle}>{d.invoice_number}</Text>
      <Text style={styles.cardDetail}>Delivered to: {d.delivered_person}</Text>
      <Text style={styles.cardDetail}>Payment: {pmLabel}</Text>
      <View style={[styles.badge, { backgroundColor: sc.bg, marginTop: 6 }]}>
        <Text style={[styles.badgeTxt, { color: sc.txt }]}>{sc.lbl}</Text>
      </View>
      {d.lat && d.lng && (
        <TouchableOpacity
          style={styles.locBtn}
          onPress={() => Linking.openURL(`https://www.google.com/maps?q=${d.lat},${d.lng}&label=${d.invoice_number}`)}>
          <Text style={styles.locBtnTxt}>📍 View delivery location</Text>
        </TouchableOpacity>
      )}
      <Text style={styles.cardTime}>{formatDate(d.created_at)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.white,
    paddingTop: Platform.OS === 'ios' ? 54 : 36,
    paddingBottom: 14, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: '#EBEBEB',
  },
  greeting: { fontSize: 18, fontWeight: '800', color: C.t1 },
  headerSub: { fontSize: 12, color: C.t2, marginTop: 2 },
  logoutBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#DDD' },
  logoutTxt: { fontSize: 12, fontWeight: '700', color: C.destroy },

  scroll: { flex: 1, padding: 14 },
  sectionLabel: { fontSize: 10, fontWeight: '700', color: C.t2, letterSpacing: 0.8, marginBottom: 10, marginTop: 4 },
  resultCount: { fontSize: 11, color: C.t2, marginBottom: 8 },

  // Work status pill
  trackPill: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    width: '100%', height: 60, borderRadius: 30,
    justifyContent: 'center', marginTop: 8,
  },
  trackDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.7)' },
  trackPillTxt: { fontSize: 15, fontWeight: '800', color: '#fff' },
  trackHint: { fontSize: 11, marginTop: 10, fontWeight: '600' },

  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  statCard: {
    flex: 1, backgroundColor: C.white, borderRadius: 14, padding: 14,
    alignItems: 'center', ...shadow,
  },
  statVal: { fontSize: 24, fontWeight: '800' },
  statLbl: { fontSize: 10, fontWeight: '600', color: C.t2, marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.4 },

  card: { backgroundColor: C.white, borderRadius: 16, padding: 14, marginBottom: 10, ...shadow },
  cardLeft: { borderLeftWidth: 4, paddingLeft: 14 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: C.t1, marginBottom: 4 },
  cardDetail: { fontSize: 12, color: C.t2, marginTop: 2, lineHeight: 18 },
  cardTime: { fontSize: 10, color: C.t3, marginTop: 8 },

  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeTxt: { fontSize: 11, fontWeight: '700' },

  locBtn: { marginTop: 8 },
  locBtnTxt: { fontSize: 12, color: C.red, fontWeight: '600' },

  filterScroll: { paddingHorizontal: 14, paddingVertical: 10, flexGrow: 0 },
  filterPill: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: C.white, marginRight: 8, borderWidth: 1, borderColor: '#DDD',
  },
  filterPillOn: { backgroundColor: C.red, borderColor: C.red },
  filterPillTxt: { fontSize: 12, fontWeight: '600', color: C.t2 },
  filterPillTxtOn: { color: '#fff' },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.white, borderRadius: 12, paddingHorizontal: 12,
    height: 42, borderWidth: 1, borderColor: '#E8EAED',
  },
  searchIcon: { fontSize: 14 },
  searchInput: { flex: 1, fontSize: 13, color: C.t1 },

  tabBar: {
    flexDirection: 'row', backgroundColor: C.white,
    borderTopWidth: 1, borderTopColor: '#EBEBEB',
    paddingBottom: Platform.OS === 'ios' ? 24 : 8, paddingTop: 8,
  },
  tabItem: { flex: 1, alignItems: 'center', gap: 2, position: 'relative' },
  tabIcon: { fontSize: 20 },
  tabLabel: { fontSize: 10, fontWeight: '600', color: C.t3 },
  tabLabelOn: { color: C.red },
  tabIndicator: {
    position: 'absolute', bottom: -8, width: 20, height: 3,
    backgroundColor: C.red, borderRadius: 2,
  },

  fab: {
    position: 'absolute', bottom: 90, right: 18,
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: C.red, alignItems: 'center', justifyContent: 'center',
    shadowColor: C.red, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 10, elevation: 8,
  },
  fabTxt: { color: '#fff', fontSize: 28, fontWeight: '300', lineHeight: 32 },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.42)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 24,
  },
  sheetHandle: { width: 38, height: 4, backgroundColor: '#DDD', borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: C.red, textAlign: 'center', marginBottom: 4 },
  sheetSub: { fontSize: 13, color: C.t2, textAlign: 'center', marginBottom: 16 },

  label: { fontSize: 12, fontWeight: '700', color: C.t2, marginBottom: 6, marginTop: 8 },
  req: { color: C.red },
  input: {
    height: 46, backgroundColor: '#F4F5F7', borderRadius: 12,
    paddingHorizontal: 14, fontSize: 14, color: C.t1,
    borderWidth: 1, borderColor: '#E8EAED',
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 4 },

  payRow: { flexDirection: 'row', gap: 8 },
  payOpt: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#DDD', alignItems: 'center',
  },
  payOptSel: { borderColor: C.red, backgroundColor: C.redL },
  payOptTxt: { fontSize: 12, fontWeight: '700', color: C.t2 },
  payOptTxtSel: { color: C.red },

  submitBtn: { height: 50, backgroundColor: C.red, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  submitTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
  cancelBtn: { alignItems: 'center', marginTop: 12, paddingBottom: 4 },
  cancelTxt: { color: C.t2, fontSize: 14, fontWeight: '600' },

  markPaidBtn: { marginTop: 10, backgroundColor: C.green, padding: 10, borderRadius: 10, alignItems: 'center' },
  markPaidTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },

  infoBox: { backgroundColor: '#FFF8E1', borderRadius: 10, padding: 10, marginTop: 8 },
  infoTxt: { fontSize: 12, color: '#7D6608', lineHeight: 18 },

  empty: { textAlign: 'center', color: C.t3, marginTop: 40, fontSize: 14 },
});
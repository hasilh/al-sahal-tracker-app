import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, ScrollView, Modal, Switch,
  RefreshControl, StatusBar, Platform, Linking
} from 'react-native';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { startTracking, stopTracking, isTracking } from '../services/location';
import {
  logVisit, getVisits, logDelivery, getDeliveries,
  getNotPaidInvoices, requestPayment, removeToken,
  logSale, getSalesLog, getNotPaidSales, requestSalePayment,
  getSalesTarget, requestVisitEdit, requestDeliveryEdit
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
  ]).catch(() => {});
}

const C = {
  red: '#C0392B', redD: '#A93226', redL: '#FADBD8',
  navy: '#2C3E50', green: '#27AE60', greenL: '#D5F5E3',
  amber: '#F39C12', amberL: '#FDEBD0', destroy: '#EA4335',
  bg: '#F4F5F7', white: '#FFFFFF',
  t1: '#1A252F', t2: '#5D6D7E', t3: '#AAB7C4',
  trackStart: '#27AE60',
  trackActive: '#C0392B',
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

function asUTC(ts) {
  if (!ts) return null;
  const iso = /[Zz]|[+-]\d\d:\d\d$/.test(ts) ? ts : ts + 'Z';
  return new Date(iso);
}

function formatDate(ts) {
  const src = asUTC(ts);
  if (!src) return '';
  const d = new Date(src.getTime() + (4 * 60 * 60 * 1000));
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

function FilterBar({ selected, onSelect }) {
  return (
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
}

function SearchBar({ value, onChange, placeholder }) {
  return (
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
}

export default function SalesmanDashboard({ route, navigation }) {
  const { name } = route.params || {};
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState('home');
  const [tracking, setTracking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [visits, setVisits] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [notPaid, setNotPaid] = useState([]);
  const [salesLog, setSalesLog] = useState([]);
  const [notPaidSales, setNotPaidSales] = useState([]);
  const [salesTarget, setSalesTarget] = useState({ target_amount: 0, achieved_amount: 0 });
  const [visitFilter, setVisitFilter] = useState('today');
  const [deliveryFilter, setDeliveryFilter] = useState('today');
  const [salesLogFilter, setSalesLogFilter] = useState('today');
  const [visitSearch, setVisitSearch] = useState('');
  const [deliverySearch, setDeliverySearch] = useState('');
  const [notPaidSearch, setNotPaidSearch] = useState('');
  const [salesLogSearch, setSalesLogSearch] = useState('');

  // New visit modal
  const [visitModal, setVisitModal] = useState(false);
  const [company, setCompany] = useState('');
  const [contactName, setContactName] = useState('');
  const [mobile, setMobile] = useState('');
  const [emailId, setEmailId] = useState('');
  const [quotation, setQuotation] = useState(false);
  const [quotationDesc, setQuotationDesc] = useState('');
  const [vLoading, setVLoading] = useState(false);

  // Edit visit modal
  const [editVisitModal, setEditVisitModal] = useState(false);
  const [editingVisit, setEditingVisit] = useState(null);
  const [editCompany, setEditCompany] = useState('');
  const [editContact, setEditContact] = useState('');
  const [editMobile, setEditMobile] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editQuotation, setEditQuotation] = useState(false);
  const [editQuotationDesc, setEditQuotationDesc] = useState('');
  const [editVLoading, setEditVLoading] = useState(false);

  // New delivery modal
  const [deliveryModal, setDeliveryModal] = useState(false);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [deliveryCompany, setDeliveryCompany] = useState('');
  const [deliveredPerson, setDeliveredPerson] = useState('');
  const [deliveryAmount, setDeliveryAmount] = useState('');
  const [isMySale, setIsMySale] = useState(false);
  const [payType, setPayType] = useState('cash');
  const [cashType, setCashType] = useState('cash');
  const [dLoading, setDLoading] = useState(false);

  // Edit delivery modal
  const [editDeliveryModal, setEditDeliveryModal] = useState(false);
  const [editingDelivery, setEditingDelivery] = useState(null);
  const [editInvoiceNo, setEditInvoiceNo] = useState('');
  const [editDeliveryCompany, setEditDeliveryCompany] = useState('');
  const [editDeliveredPerson, setEditDeliveredPerson] = useState('');
  const [editPayType, setEditPayType] = useState('cash');
  const [editCashType, setEditCashType] = useState('cash');
  const [editDLoading, setEditDLoading] = useState(false);

  // Sale modal
  const [saleModal, setSaleModal] = useState(false);
  const [saleInvoiceNo, setSaleInvoiceNo] = useState('');
  const [saleDeliveredTo, setSaleDeliveredTo] = useState('');
  const [saleAmount, setSaleAmount] = useState('');
  const [salePayType, setSalePayType] = useState('cash');
  const [saleCashType, setSaleCashType] = useState('cash');
  const [sLoading, setSLoading] = useState(false);

  // Payment modal
  const [payModal, setPayModal] = useState(false);
  const [selectedInv, setSelectedInv] = useState(null);
  const [newPayType, setNewPayType] = useState('cash');
  const [newCashType, setNewCashType] = useState('cash');

  const notifIntervalRef = useRef(null);
  const dismissedTodayRef = useRef(false);

  useEffect(() => { loadVisits(); }, [visitFilter]);
  useEffect(() => { loadDeliveries(); }, [deliveryFilter]);
  useEffect(() => { loadSalesLog(); }, [salesLogFilter]);

  useEffect(() => {
    checkTracking();
    loadAll();
    setupNotifications();
    const sub = Notifications?.addNotificationResponseReceivedListener?.((resp) => {
      if (resp.actionIdentifier === 'DISMISS') dismissedTodayRef.current = true;
    });
    return () => { clearNotifInterval(); sub?.remove(); };
  }, []);

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
    } catch (e) { console.log('Notification setup failed:', e.message); }
  };

  const scheduleWorkReminderCheck = () => {
    if (!Notifications) return;
    const iv = setInterval(async () => {
      try {
        const oman = new Date(Date.now() + 4 * 60 * 60 * 1000);
        const day = oman.getUTCDay();
        const h = oman.getUTCHours();
        const m = oman.getUTCMinutes();
        const active = await isTracking();
        if (day !== 5 && h === 9 && m % 15 === 0 && !active && !dismissedTodayRef.current) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: 'Al Sahal · Work Started?',
              body: "Don't forget to mark your work as started for today!",
              sound: true,
              categoryIdentifier: 'work-reminder',
            },
            trigger: null,
          });
        }
      } catch (e) { console.log('Notification error:', e.message); }
    }, 60000);
    notifIntervalRef.current = iv;
  };

  const clearNotifInterval = () => {
    if (notifIntervalRef.current) clearInterval(notifIntervalRef.current);
  };

  const checkTracking = async () => {
    const active = await isTracking();
    setTracking(active);
  };

  const loadAll = async () => {
    await Promise.all([loadVisits(), loadDeliveries(), loadSalesLog(), loadNotPaid(), loadSalesTarget()]);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  };

  const loadVisits = async () => {
    try { setVisits(await getVisits(visitFilter)); }
    catch (e) { console.log('loadVisits error:', e?.response?.data || e.message); }
  };

  const loadDeliveries = async () => {
    try { setDeliveries(await getDeliveries(deliveryFilter)); }
    catch (e) { console.log('loadDeliveries error:', e?.response?.data || e.message); }
  };

  const loadSalesLog = async () => {
    try { setSalesLog(await getSalesLog(salesLogFilter)); }
    catch (e) { console.log('loadSalesLog error:', e?.response?.data || e.message); }
  };

  const loadSalesTarget = async () => {
    try { setSalesTarget(await getSalesTarget()); }
    catch (e) { console.log('loadSalesTarget error:', e?.response?.data || e.message); }
  };

  const loadNotPaid = async () => {
    try {
      const [deliv, sales] = await Promise.all([getNotPaidInvoices(), getNotPaidSales()]);
      setNotPaid(deliv);
      setNotPaidSales(sales);
    } catch (e) { console.log('loadNotPaid error:', e?.response?.data || e.message); }
  };

  const toggleTracking = async () => {
    if (tracking) {
      Alert.alert('Stop Work', 'Mark your work as stopped?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Stop', style: 'destructive', onPress: async () => { await stopTracking(); setTracking(false); } }
      ]);
    } else {
      const started = await startTracking();
      setTracking(started);
      if (!started) Alert.alert('Permission needed', 'Allow location access in Settings.');
    }
  };

  const resolvedPaymentMethod = (pt, ct) => pt === 'cash' ? ct : pt;

  const getCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        return { lat: loc.coords.latitude, lng: loc.coords.longitude };
      }
    } catch (e) { console.log('Location error:', e.message); }
    return { lat: null, lng: null };
  };

  // ── Visit handlers ─────────────────────────────────────────────
  const handleLogVisit = async () => {
    if (!company || !contactName || !mobile)
      return Alert.alert('Required fields missing', 'Company name, contact name and mobile are required.');
    if (quotation && !quotationDesc)
      return Alert.alert('Required', 'Please fill in the quotation details.');
    setVLoading(true);
    try {
      const { lat, lng } = await getCurrentLocation();
      await logVisit({ company_name: company, contact_name: contactName, mobile, email_id: emailId, quotation, quotation_description: quotationDesc, lat, lng });
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

  const openEditVisit = (v) => {
    setEditingVisit(v);
    setEditCompany(v.company_name || '');
    setEditContact(v.contact_name || '');
    setEditMobile(v.mobile || '');
    setEditEmail(v.email_id || '');
    setEditQuotation(v.quotation || false);
    setEditQuotationDesc(v.quotation_description || '');
    setEditVisitModal(true);
  };

  const handleEditVisit = async () => {
    if (!editCompany || !editContact || !editMobile)
      return Alert.alert('Required', 'Company name, contact name and mobile are required.');
    if (editQuotation && !editQuotationDesc)
      return Alert.alert('Required', 'Please fill in quotation details.');
    setEditVLoading(true);
    try {
      await requestVisitEdit(editingVisit.id, {
        company_name: editCompany, contact_name: editContact,
        mobile: editMobile, email_id: editEmail,
        quotation: editQuotation, quotation_description: editQuotationDesc
      });
      setEditVisitModal(false);
      loadVisits();
      Alert.alert('Submitted', 'Your edit has been sent to admin for approval.');
    } catch (e) { Alert.alert('Error', 'Failed to submit edit'); }
    finally { setEditVLoading(false); }
  };

  // ── Delivery handlers ──────────────────────────────────────────
  const handleLogDelivery = async () => {
    if (!invoiceNo.trim() || !deliveredPerson.trim())
      return Alert.alert('Required', 'Invoice number and delivered person are required.');
    const pm = resolvedPaymentMethod(payType, cashType);
    setDLoading(true);
    try {
      const { lat, lng } = await getCurrentLocation();
      await logDelivery({
        invoice_number: invoiceNo.trim(),
        company_name: deliveryCompany.trim() || null,
        delivered_person: deliveredPerson.trim(),
        payment_method: pm,
        amount: Number(deliveryAmount) || 0,
        is_sale: isMySale,
        lat, lng
      });
      setDeliveryModal(false);
      setInvoiceNo(''); setDeliveryCompany(''); setDeliveredPerson('');
      setDeliveryAmount(''); setIsMySale(false);
      setPayType('cash'); setCashType('cash');
      await loadDeliveries();
      await loadNotPaid();
      if (isMySale) await loadSalesLog();
      if (pm !== 'not_paid') await loadSalesTarget();
      Alert.alert('Saved', 'Delivery logged successfully.');
    } catch (e) {
      console.log('logDelivery error:', e?.response?.data || e.message);
      Alert.alert('Error', e?.response?.data?.error || 'Failed to save delivery');
    } finally { setDLoading(false); }
  };

  const openEditDelivery = (d) => {
    setEditingDelivery(d);
    setEditInvoiceNo(d.invoice_number || '');
    setEditDeliveryCompany(d.company_name || '');
    setEditDeliveredPerson(d.delivered_person || '');
    const pm = d.payment_method;
    if (pm === 'cash' || pm === 'bank') {
      setEditPayType('cash');
      setEditCashType(pm);
    } else {
      setEditPayType(pm || 'cash');
      setEditCashType('cash');
    }
    setEditDeliveryModal(true);
  };

  const handleEditDelivery = async () => {
    if (!editInvoiceNo.trim() || !editDeliveredPerson.trim())
      return Alert.alert('Required', 'Invoice number and delivered person are required.');
    const pm = resolvedPaymentMethod(editPayType, editCashType);
    setEditDLoading(true);
    try {
      await requestDeliveryEdit(editingDelivery.id, {
        invoice_number: editInvoiceNo.trim(),
        company_name: editDeliveryCompany.trim() || null,
        delivered_person: editDeliveredPerson.trim(),
        payment_method: pm
      });
      setEditDeliveryModal(false);
      loadDeliveries();
      Alert.alert('Submitted', 'Your edit has been sent to admin for approval.');
    } catch (e) { Alert.alert('Error', 'Failed to submit edit'); }
    finally { setEditDLoading(false); }
  };

  // ── Sale handler ───────────────────────────────────────────────
  const handleLogSale = async () => {
    if (!saleInvoiceNo.trim() || !saleDeliveredTo.trim())
      return Alert.alert('Required', 'Invoice number and delivered to are required.');
    const pm = resolvedPaymentMethod(salePayType, saleCashType);
    setSLoading(true);
    try {
      await logSale({ invoice_number: saleInvoiceNo.trim(), delivered_to: saleDeliveredTo.trim(), amount: Number(saleAmount) || 0, payment_method: pm });
      setSaleModal(false);
      setSaleInvoiceNo(''); setSaleDeliveredTo(''); setSaleAmount('');
      setSalePayType('cash'); setSaleCashType('cash');
      await loadSalesLog();
      await loadNotPaid();
      if (pm !== 'not_paid') await loadSalesTarget();
      Alert.alert('Saved', 'Sale logged successfully.');
    } catch (e) {
      console.log('logSale error:', e?.response?.data || e.message);
      Alert.alert('Error', e?.response?.data?.error || 'Failed to save sale');
    } finally { setSLoading(false); }
  };

  // ── Payment request ────────────────────────────────────────────
  const handleRequestPayment = async () => {
    const pm = resolvedPaymentMethod(newPayType, newCashType);
    try {
      if (selectedInv._source === 'sales') {
        await requestSalePayment(selectedInv.id, pm);
        setNotPaidSales(prev => prev.map(inv => inv.id === selectedInv.id ? { ...inv, status: 'pending_approval', payment_method: pm } : inv));
      } else {
        await requestPayment(selectedInv.id, pm);
        setNotPaid(prev => prev.map(inv => inv.id === selectedInv.id ? { ...inv, status: 'pending_approval', payment_method: pm } : inv));
      }
      setPayModal(false);
    } catch (e) { Alert.alert('Error', 'Failed to submit payment request'); }
  };

  const handleLogout = async () => {
    Alert.alert('Sign out', 'Your work tracker will keep running until you stop it.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => { clearNotifInterval(); await removeToken(); navigation.replace('Login'); } }
    ]);
  };

  const searchFilter = (list, term, keys) => {
    if (!term.trim()) return list;
    const t = term.toLowerCase();
    return list.filter(item => keys.some(k => (item[k] || '').toLowerCase().includes(t)));
  };

  const filteredVisits = searchFilter(visits, visitSearch, ['company_name','contact_name','mobile','email_id']);
  const filteredDeliveries = searchFilter(deliveries, deliverySearch, ['invoice_number','company_name','delivered_person','payment_method']);
  const filteredSalesLog = searchFilter(salesLog, salesLogSearch, ['invoice_number','delivered_to','payment_method']);
  const mergedNotPaid = [
    ...notPaid.map(i => ({ ...i, _source: 'delivery', _to: i.delivered_person })),
    ...notPaidSales.map(i => ({ ...i, _source: 'sales', _to: i.delivered_to })),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const filteredNotPaid = searchFilter(mergedNotPaid, notPaidSearch, ['invoice_number','_to']);

  const PayTypeSelector = ({ type, setType, cashT, setCashT }) => (
    <View>
      <View style={styles.payRow}>
        {[['cash','Cash'],['credit','Credit'],['not_paid','Not Paid']].map(([val,lbl]) => (
          <TouchableOpacity key={val} style={[styles.payOpt, type===val && styles.payOptSel]} onPress={() => setType(val)}>
            <Text style={[styles.payOptTxt, type===val && styles.payOptTxtSel]}>{lbl}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {type === 'cash' && (
        <View style={[styles.payRow, { marginTop: 8 }]}>
          {[['cash','Cash'],['bank','Bank Transfer']].map(([val,lbl]) => (
            <TouchableOpacity key={val} style={[styles.payOpt, cashT===val && styles.payOptSel]} onPress={() => setCashT(val)}>
              <Text style={[styles.payOptTxt, cashT===val && styles.payOptTxtSel]}>{lbl}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );

  const openVisitLocation = (lat, lng, co) => {
    if (!lat || !lng) return Alert.alert('No location', 'No location was saved for this visit.');
    Linking.openURL(`https://www.google.com/maps?q=${lat},${lng}&label=${co}`);
  };

  // ── Tab screens ────────────────────────────────────────────────
  const HomeTab = () => (
    <ScrollView style={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <View style={[styles.card, { padding: 20, alignItems: 'center' }]}>
        <Text style={styles.sectionLabel}>WORK STATUS</Text>
        <TouchableOpacity
          style={[styles.trackPill, { backgroundColor: tracking ? C.trackActive : C.trackStart }]}
          onPress={toggleTracking} activeOpacity={0.85}>
          <View style={styles.trackDot} />
          <Text style={styles.trackPillTxt}>{tracking ? 'Work Started  —  Tap to Stop' : 'Start Work'}</Text>
        </TouchableOpacity>
        <Text style={[styles.trackHint, { color: tracking ? C.red : C.green }]}>
          {tracking ? 'You are currently active' : 'Tap to mark yourself as started'}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionLabel}>SALES TARGET · THIS MONTH</Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginTop: 2 }}>
          <Text style={styles.targetAchieved}>{Number(salesTarget.achieved_amount || 0).toFixed(0)}</Text>
          <Text style={styles.targetSlash}>/ {Number(salesTarget.target_amount || 0).toFixed(0)} OMR</Text>
        </View>
        <View style={styles.targetBarBg}>
          <View style={[styles.targetBarFill, {
            width: `${salesTarget.target_amount > 0 ? Math.min(100, (salesTarget.achieved_amount / salesTarget.target_amount) * 100) : 0}%`
          }]} />
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={[styles.statVal, { color: C.navy }]}>{visits.length}</Text>
          <Text style={styles.statLbl}>Visits</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statVal, { color: C.red }]}>{mergedNotPaid.filter(i => i.status === 'not_paid').length}</Text>
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
          onLocPress={() => openVisitLocation(v.lat, v.lng, v.company_name)}
          onEdit={() => openEditVisit(v)} />
      ))}
      {visits.length === 0 && <Text style={styles.empty}>No visits today</Text>}
      <View style={{ height: 20 }} />
    </ScrollView>
  );

  const VisitsTab = () => (
    <>
      <FilterBar selected={visitFilter} onSelect={setVisitFilter} />
      <View style={{ paddingHorizontal: 14, paddingBottom: 6 }}>
        <SearchBar value={visitSearch} onChange={setVisitSearch} placeholder="Search company, contact, mobile…" />
      </View>
      <ScrollView style={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <Text style={styles.resultCount}>{filteredVisits.length} visit{filteredVisits.length !== 1 ? 's' : ''}</Text>
        {filteredVisits.map((v, i) => (
          <VisitCard key={v.id} v={v} color={SALESMAN_COLORS[i % SALESMAN_COLORS.length]}
            onLocPress={() => openVisitLocation(v.lat, v.lng, v.company_name)}
            onEdit={() => openEditVisit(v)} />
        ))}
        {filteredVisits.length === 0 && <Text style={styles.empty}>No visits found</Text>}
        <View style={{ height: 80 }} />
      </ScrollView>
      <TouchableOpacity style={[styles.fab, { bottom: 90 + insets.bottom }]} onPress={() => setVisitModal(true)}>
        <Text style={styles.fabTxt}>+</Text>
      </TouchableOpacity>
    </>
  );

  const DeliveryTab = () => (
    <>
      <FilterBar selected={deliveryFilter} onSelect={setDeliveryFilter} />
      <View style={{ paddingHorizontal: 14, paddingBottom: 6 }}>
        <SearchBar value={deliverySearch} onChange={setDeliverySearch} placeholder="Search invoice, company, recipient…" />
      </View>
      <ScrollView style={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <Text style={styles.resultCount}>{filteredDeliveries.length} delivery records</Text>
        {filteredDeliveries.map((d, i) => (
          <DeliveryCard key={d.id} d={d} color={SALESMAN_COLORS[i % SALESMAN_COLORS.length]}
            onEdit={() => openEditDelivery(d)} />
        ))}
        {filteredDeliveries.length === 0 && <Text style={styles.empty}>No deliveries found</Text>}
        <View style={{ height: 80 }} />
      </ScrollView>
      <TouchableOpacity style={[styles.fab, { bottom: 90 + insets.bottom }]} onPress={() => setDeliveryModal(true)}>
        <Text style={styles.fabTxt}>+</Text>
      </TouchableOpacity>
    </>
  );

  const NotPaidTab = () => (
    <>
      <View style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6 }}>
        <SearchBar value={notPaidSearch} onChange={setNotPaidSearch} placeholder="Search invoice, company…" />
      </View>
      <ScrollView style={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <Text style={styles.resultCount}>{filteredNotPaid.length} unpaid invoice{filteredNotPaid.length !== 1 ? 's' : ''}</Text>
        {filteredNotPaid.map((inv) => {
          const isPending = inv.status === 'pending_approval';
          return (
            <View key={`${inv._source}-${inv.id}`} style={[styles.card, styles.cardLeft, { borderLeftColor: isPending ? C.amber : C.red }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.cardTitle}>{inv.invoice_number}</Text>
                <View style={[styles.badge, { backgroundColor: inv._source === 'sales' ? '#EAF0FB' : '#F4ECFB' }]}>
                  <Text style={[styles.badgeTxt, { color: inv._source === 'sales' ? '#1A5276' : '#5B2C6F' }]}>
                    {inv._source === 'sales' ? 'Sale' : 'Delivery'}
                  </Text>
                </View>
              </View>
              {inv.company_name ? <Text style={styles.cardDetail}>Company: {inv.company_name}</Text> : null}
              <Text style={styles.cardDetail}>Delivered to: {inv._to}</Text>
              {inv.amount ? <Text style={styles.cardDetail}>Amount: {Number(inv.amount).toFixed(2)} OMR</Text> : null}
              <Text style={styles.cardTime}>{formatDate(inv.created_at)}</Text>
              <View style={[styles.badge, { backgroundColor: isPending ? C.amberL : C.redL, marginTop: 8 }]}>
                <Text style={[styles.badgeTxt, { color: isPending ? '#784212' : C.redD }]}>
                  {isPending ? '⏳ Waiting for admin approval' : '✗ Not Paid'}
                </Text>
              </View>
              {!isPending && (
                <TouchableOpacity style={styles.markPaidBtn}
                  onPress={() => { setSelectedInv(inv); setNewPayType('cash'); setNewCashType('cash'); setPayModal(true); }}>
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

  const SalesLogTab = () => (
    <>
      <FilterBar selected={salesLogFilter} onSelect={setSalesLogFilter} />
      <View style={{ paddingHorizontal: 14, paddingBottom: 6 }}>
        <SearchBar value={salesLogSearch} onChange={setSalesLogSearch} placeholder="Search invoice, recipient…" />
      </View>
      <ScrollView style={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <Text style={styles.resultCount}>{filteredSalesLog.length} sale{filteredSalesLog.length !== 1 ? 's' : ''}</Text>
        {filteredSalesLog.map((s, i) => (
          <SaleCard key={s.id} s={s} color={SALESMAN_COLORS[i % SALESMAN_COLORS.length]} />
        ))}
        {filteredSalesLog.length === 0 && <Text style={styles.empty}>No sales logged</Text>}
        <View style={{ height: 80 }} />
      </ScrollView>
      <TouchableOpacity style={[styles.fab, { bottom: 90 + insets.bottom }]} onPress={() => setSaleModal(true)}>
        <Text style={styles.fabTxt}>+</Text>
      </TouchableOpacity>
    </>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={C.white} />
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
        {activeTab === 'saleslog' && <SalesLogTab />}
        {activeTab === 'notpaid' && <NotPaidTab />}
      </View>

      <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 10) + 10 }]}>
        {[
          { key: 'home', label: 'Home', icon: '🏠' },
          { key: 'visits', label: 'Visits', icon: '📍' },
          { key: 'delivery', label: 'Delivery', icon: '🚚' },
          { key: 'saleslog', label: 'Sales Log', icon: '💰' },
          { key: 'notpaid', label: 'Not Paid', icon: '🧾' },
        ].map(t => (
          <TouchableOpacity key={t.key} style={styles.tabItem} onPress={() => setActiveTab(t.key)}>
            <Text style={styles.tabIcon}>{t.icon}</Text>
            <Text style={[styles.tabLabel, activeTab === t.key && styles.tabLabelOn]}>{t.label}</Text>
            {activeTab === t.key && <View style={styles.tabIndicator} />}
          </TouchableOpacity>
        ))}
      </View>

      {/* ── New Visit Modal ── */}
      <Modal visible={visitModal} animationType="slide" transparent>
        <View style={styles.overlay}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={styles.sheet}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>New Visit Log</Text>
              <Text style={styles.label}>Company Name <Text style={styles.req}>*</Text></Text>
              <TextInput style={styles.input} placeholder="Company name" placeholderTextColor={C.t3} value={company} onChangeText={setCompany} />
              <Text style={styles.label}>Contact Name <Text style={styles.req}>*</Text></Text>
              <TextInput style={styles.input} placeholder="Contact person" placeholderTextColor={C.t3} value={contactName} onChangeText={setContactName} />
              <Text style={styles.label}>Mobile <Text style={styles.req}>*</Text></Text>
              <TextInput style={styles.input} placeholder="+968 XXXX XXXX" placeholderTextColor={C.t3} value={mobile} onChangeText={setMobile} keyboardType="phone-pad" />
              <Text style={styles.label}>Email ID</Text>
              <TextInput style={styles.input} placeholder="Optional" placeholderTextColor={C.t3} value={emailId} onChangeText={setEmailId} keyboardType="email-address" autoCapitalize="none" />
              <View style={styles.switchRow}>
                <Text style={styles.label}>Quotation Required?</Text>
                <Switch value={quotation} onValueChange={setQuotation} trackColor={{ true: C.green, false: '#DDD' }} thumbColor="#fff" />
              </View>
              {quotation && (
                <>
                  <Text style={styles.label}>Quotation Details <Text style={styles.req}>*</Text></Text>
                  <TextInput style={[styles.input, { height: 80, textAlignVertical: 'top', paddingTop: 12 }]}
                    placeholder="Describe the quotation…" placeholderTextColor={C.t3} value={quotationDesc} onChangeText={setQuotationDesc} multiline />
                </>
              )}
              <View style={styles.infoBox}>
                <Text style={styles.infoTxt}>Your current location will be saved with this visit log.</Text>
              </View>
              <TouchableOpacity style={styles.submitBtn} onPress={handleLogVisit} disabled={vLoading}>
                {vLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitTxt}>Save Visit</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setVisitModal(false); resetVisitForm(); }}>
                <Text style={styles.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Edit Visit Modal ── */}
      <Modal visible={editVisitModal} animationType="slide" transparent>
        <View style={styles.overlay}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={styles.sheet}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>Edit Visit</Text>
              <View style={styles.infoBox}>
                <Text style={styles.infoTxt}>Changes require admin approval before they take effect.</Text>
              </View>
              <Text style={styles.label}>Company Name <Text style={styles.req}>*</Text></Text>
              <TextInput style={styles.input} placeholderTextColor={C.t3} value={editCompany} onChangeText={setEditCompany} />
              <Text style={styles.label}>Contact Name <Text style={styles.req}>*</Text></Text>
              <TextInput style={styles.input} placeholderTextColor={C.t3} value={editContact} onChangeText={setEditContact} />
              <Text style={styles.label}>Mobile <Text style={styles.req}>*</Text></Text>
              <TextInput style={styles.input} placeholderTextColor={C.t3} value={editMobile} onChangeText={setEditMobile} keyboardType="phone-pad" />
              <Text style={styles.label}>Email ID</Text>
              <TextInput style={styles.input} placeholderTextColor={C.t3} value={editEmail} onChangeText={setEditEmail} keyboardType="email-address" autoCapitalize="none" />
              <View style={styles.switchRow}>
                <Text style={styles.label}>Quotation Required?</Text>
                <Switch value={editQuotation} onValueChange={setEditQuotation} trackColor={{ true: C.green, false: '#DDD' }} thumbColor="#fff" />
              </View>
              {editQuotation && (
                <>
                  <Text style={styles.label}>Quotation Details <Text style={styles.req}>*</Text></Text>
                  <TextInput style={[styles.input, { height: 80, textAlignVertical: 'top', paddingTop: 12 }]}
                    placeholderTextColor={C.t3} value={editQuotationDesc} onChangeText={setEditQuotationDesc} multiline />
                </>
              )}
              <TouchableOpacity style={styles.submitBtn} onPress={handleEditVisit} disabled={editVLoading}>
                {editVLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitTxt}>Submit for Approval</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditVisitModal(false)}>
                <Text style={styles.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── New Delivery Modal ── */}
      <Modal visible={deliveryModal} animationType="slide" transparent>
        <View style={styles.overlay}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={styles.sheet}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>New Delivery Log</Text>
              <Text style={styles.label}>Invoice Number <Text style={styles.req}>*</Text></Text>
              <TextInput style={styles.input} placeholder="INV-2025-XXXX" placeholderTextColor={C.t3} value={invoiceNo} onChangeText={setInvoiceNo} />
              <Text style={styles.label}>Company Name</Text>
              <TextInput style={styles.input} placeholder="Company / client name" placeholderTextColor={C.t3} value={deliveryCompany} onChangeText={setDeliveryCompany} />
              <Text style={styles.label}>Delivered To <Text style={styles.req}>*</Text></Text>
              <TextInput style={styles.input} placeholder="Person name" placeholderTextColor={C.t3} value={deliveredPerson} onChangeText={setDeliveredPerson} />
              <Text style={styles.label}>Amount (OMR)</Text>
              <TextInput style={styles.input} placeholder="0.00" placeholderTextColor={C.t3} value={deliveryAmount} onChangeText={setDeliveryAmount} keyboardType="decimal-pad" />
              <View style={styles.switchRow}>
                <Text style={styles.label}>My Sales — also log this as a sale?</Text>
                <Switch value={isMySale} onValueChange={setIsMySale} trackColor={{ true: C.green, false: '#DDD' }} thumbColor="#fff" />
              </View>
              <Text style={styles.label}>Payment Method <Text style={styles.req}>*</Text></Text>
              <PayTypeSelector type={payType} setType={setPayType} cashT={cashType} setCashT={setCashType} />
              <View style={styles.infoBox}>
                <Text style={styles.infoTxt}>Your current location will be saved with this delivery.</Text>
              </View>
              <TouchableOpacity style={[styles.submitBtn, { marginTop: 12 }]} onPress={handleLogDelivery} disabled={dLoading}>
                {dLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitTxt}>Save Delivery</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setDeliveryModal(false)}>
                <Text style={styles.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Edit Delivery Modal ── */}
      <Modal visible={editDeliveryModal} animationType="slide" transparent>
        <View style={styles.overlay}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={styles.sheet}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>Edit Delivery</Text>
              <View style={styles.infoBox}>
                <Text style={styles.infoTxt}>Changes require admin approval before they take effect.</Text>
              </View>
              <Text style={styles.label}>Invoice Number <Text style={styles.req}>*</Text></Text>
              <TextInput style={styles.input} placeholderTextColor={C.t3} value={editInvoiceNo} onChangeText={setEditInvoiceNo} />
              <Text style={styles.label}>Company Name</Text>
              <TextInput style={styles.input} placeholder="Company / client name" placeholderTextColor={C.t3} value={editDeliveryCompany} onChangeText={setEditDeliveryCompany} />
              <Text style={styles.label}>Delivered To <Text style={styles.req}>*</Text></Text>
              <TextInput style={styles.input} placeholderTextColor={C.t3} value={editDeliveredPerson} onChangeText={setEditDeliveredPerson} />
              <Text style={styles.label}>Payment Method <Text style={styles.req}>*</Text></Text>
              <PayTypeSelector type={editPayType} setType={setEditPayType} cashT={editCashType} setCashT={setEditCashType} />
              <TouchableOpacity style={[styles.submitBtn, { marginTop: 16 }]} onPress={handleEditDelivery} disabled={editDLoading}>
                {editDLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitTxt}>Submit for Approval</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditDeliveryModal(false)}>
                <Text style={styles.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Sale Modal ── */}
      <Modal visible={saleModal} animationType="slide" transparent>
        <View style={styles.overlay}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={styles.sheet}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>New Sale Log</Text>
              <Text style={styles.label}>Invoice Number <Text style={styles.req}>*</Text></Text>
              <TextInput style={styles.input} placeholder="INV-2025-XXXX" placeholderTextColor={C.t3} value={saleInvoiceNo} onChangeText={setSaleInvoiceNo} />
              <Text style={styles.label}>Delivered To <Text style={styles.req}>*</Text></Text>
              <TextInput style={styles.input} placeholder="Person / company name" placeholderTextColor={C.t3} value={saleDeliveredTo} onChangeText={setSaleDeliveredTo} />
              <Text style={styles.label}>Amount (OMR)</Text>
              <TextInput style={styles.input} placeholder="0.00" placeholderTextColor={C.t3} value={saleAmount} onChangeText={setSaleAmount} keyboardType="decimal-pad" />
              <Text style={styles.label}>Payment Method <Text style={styles.req}>*</Text></Text>
              <PayTypeSelector type={salePayType} setType={setSalePayType} cashT={saleCashType} setCashT={setSaleCashType} />
              <TouchableOpacity style={[styles.submitBtn, { marginTop: 12 }]} onPress={handleLogSale} disabled={sLoading}>
                {sLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitTxt}>Save Sale</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setSaleModal(false)}>
                <Text style={styles.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Mark as Paid Modal ── */}
      <Modal visible={payModal} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Mark as Paid</Text>
            <Text style={styles.sheetSub}>{selectedInv?.invoice_number}</Text>
            <Text style={styles.label}>Payment Method <Text style={styles.req}>*</Text></Text>
            <PayTypeSelector type={newPayType} setType={setNewPayType} cashT={newCashType} setCashT={setNewCashType} />
            <View style={styles.infoBox}>
              <Text style={styles.infoTxt}>Invoice stays in Not Paid until admin approves.</Text>
            </View>
            <TouchableOpacity style={[styles.submitBtn, { marginTop: 12 }]} onPress={handleRequestPayment}>
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
function VisitCard({ v, color, onLocPress, onEdit }) {
  return (
    <View style={[styles.card, styles.cardLeft, { borderLeftColor: color }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Text style={[styles.cardTitle, { flex: 1 }]}>{v.company_name}</Text>
        {onEdit && v.edit_status !== 'pending' && (
          <TouchableOpacity onPress={onEdit} style={{ paddingLeft: 8, paddingTop: 2 }}>
            <Text style={{ fontSize: 11, color: C.t2, fontWeight: '700' }}>✏️ Edit</Text>
          </TouchableOpacity>
        )}
      </View>
      <Text style={styles.cardDetail}>{v.contact_name}  ·  {v.mobile}</Text>
      {v.email_id ? <Text style={styles.cardDetail}>{v.email_id}</Text> : null}
      {v.quotation ? (
        <View style={[styles.badge, { backgroundColor: '#EAF0FB', marginTop: 6 }]}>
          <Text style={[styles.badgeTxt, { color: '#1A5276' }]}>Quotation sent</Text>
        </View>
      ) : null}
      {v.edit_status === 'pending' && (
        <View style={[styles.badge, { backgroundColor: '#FFF8E1', marginTop: 6 }]}>
          <Text style={[styles.badgeTxt, { color: '#7D6608' }]}>⏳ Edit pending approval</Text>
        </View>
      )}
      {v.lat && v.lng ? (
        <TouchableOpacity onPress={onLocPress} style={styles.locBtn}>
          <Text style={styles.locBtnTxt}>📍 View visit location</Text>
        </TouchableOpacity>
      ) : null}
      <Text style={styles.cardTime}>{formatDate(v.visited_at)}</Text>
    </View>
  );
}

function DeliveryCard({ d, color, onEdit }) {
  const sc = d.status === 'paid'
    ? { bg: '#D5F5E3', txt: '#145A32', lbl: '✓ Paid' }
    : d.status === 'pending_approval'
    ? { bg: '#FDEBD0', txt: '#784212', lbl: '⏳ Pending approval' }
    : { bg: '#FADBD8', txt: '#922B21', lbl: '✗ Not Paid' };
  const pmLabel = d.payment_method === 'bank' ? 'Bank Transfer'
    : d.payment_method === 'not_paid' ? 'Not Paid'
    : d.payment_method ? d.payment_method.charAt(0).toUpperCase() + d.payment_method.slice(1) : '—';
  return (
    <View style={[styles.card, styles.cardLeft, { borderLeftColor: color }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Text style={[styles.cardTitle, { flex: 1 }]}>{d.invoice_number}</Text>
        {onEdit && d.edit_status !== 'pending' && (
          <TouchableOpacity onPress={onEdit} style={{ paddingLeft: 8, paddingTop: 2 }}>
            <Text style={{ fontSize: 11, color: C.t2, fontWeight: '700' }}>✏️ Edit</Text>
          </TouchableOpacity>
        )}
      </View>
      {d.company_name ? <Text style={styles.cardDetail}>Company: {d.company_name}</Text> : null}
      <Text style={styles.cardDetail}>Delivered to: {d.delivered_person}</Text>
      <Text style={styles.cardDetail}>Payment: {pmLabel}</Text>
      {d.edit_status === 'pending' && (
        <View style={[styles.badge, { backgroundColor: '#FFF8E1', marginTop: 6 }]}>
          <Text style={[styles.badgeTxt, { color: '#7D6608' }]}>⏳ Edit pending approval</Text>
        </View>
      )}
      <View style={[styles.badge, { backgroundColor: sc.bg, marginTop: 6 }]}>
        <Text style={[styles.badgeTxt, { color: sc.txt }]}>{sc.lbl}</Text>
      </View>
      {d.lat && d.lng && (
        <TouchableOpacity style={styles.locBtn}
          onPress={() => Linking.openURL(`https://www.google.com/maps?q=${d.lat},${d.lng}&label=${d.invoice_number}`)}>
          <Text style={styles.locBtnTxt}>📍 View delivery location</Text>
        </TouchableOpacity>
      )}
      <Text style={styles.cardTime}>{formatDate(d.created_at)}</Text>
    </View>
  );
}

function SaleCard({ s, color }) {
  const sc = s.status === 'paid'
    ? { bg: '#D5F5E3', txt: '#145A32', lbl: '✓ Paid' }
    : s.status === 'pending_approval'
    ? { bg: '#FDEBD0', txt: '#784212', lbl: '⏳ Pending approval' }
    : { bg: '#FADBD8', txt: '#922B21', lbl: '✗ Not Paid' };
  const pmLabel = s.payment_method === 'bank' ? 'Bank Transfer'
    : s.payment_method === 'not_paid' ? 'Not Paid'
    : s.payment_method ? s.payment_method.charAt(0).toUpperCase() + s.payment_method.slice(1) : '—';
  return (
    <View style={[styles.card, styles.cardLeft, { borderLeftColor: color }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={styles.cardTitle}>{s.invoice_number}</Text>
        {s.source === 'delivery' && (
          <View style={[styles.badge, { backgroundColor: '#F4ECFB' }]}>
            <Text style={[styles.badgeTxt, { color: '#5B2C6F' }]}>From Delivery</Text>
          </View>
        )}
      </View>
      <Text style={styles.cardDetail}>Delivered to: {s.delivered_to}</Text>
      <Text style={styles.cardDetail}>Amount: {Number(s.amount || 0).toFixed(2)} OMR</Text>
      <Text style={styles.cardDetail}>Payment: {pmLabel}</Text>
      <View style={[styles.badge, { backgroundColor: sc.bg, marginTop: 6 }]}>
        <Text style={[styles.badgeTxt, { color: sc.txt }]}>{sc.lbl}</Text>
      </View>
      <Text style={styles.cardTime}>{formatDate(s.created_at)}</Text>
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
  trackPill: { flexDirection: 'row', alignItems: 'center', gap: 10, width: '100%', height: 60, borderRadius: 30, justifyContent: 'center', marginTop: 8 },
  trackDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.7)' },
  trackPillTxt: { fontSize: 15, fontWeight: '800', color: '#fff' },
  trackHint: { fontSize: 11, marginTop: 10, fontWeight: '600' },
  targetAchieved: { fontSize: 22, fontWeight: '800', color: C.navy },
  targetSlash: { fontSize: 13, fontWeight: '600', color: C.t2, marginBottom: 2 },
  targetBarBg: { height: 8, backgroundColor: '#E8EAED', borderRadius: 4, marginTop: 10, overflow: 'hidden' },
  targetBarFill: { height: 8, backgroundColor: C.green, borderRadius: 4 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  statCard: { flex: 1, backgroundColor: C.white, borderRadius: 14, padding: 14, alignItems: 'center', ...shadow },
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
  filterPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: C.white, marginRight: 8, borderWidth: 1, borderColor: '#DDD' },
  filterPillOn: { backgroundColor: C.red, borderColor: C.red },
  filterPillTxt: { fontSize: 12, fontWeight: '600', color: C.t2 },
  filterPillTxtOn: { color: '#fff' },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.white, borderRadius: 12, paddingHorizontal: 12, height: 42, borderWidth: 1, borderColor: '#E8EAED' },
  searchIcon: { fontSize: 14 },
  searchInput: { flex: 1, fontSize: 13, color: C.t1 },
  tabBar: { flexDirection: 'row', backgroundColor: C.white, borderTopWidth: 1, borderTopColor: '#EBEBEB', paddingBottom: Platform.OS === 'ios' ? 24 : 8, paddingTop: 8 },
  tabItem: { flex: 1, alignItems: 'center', gap: 2, position: 'relative' },
  tabIcon: { fontSize: 20 },
  tabLabel: { fontSize: 10, fontWeight: '600', color: C.t3 },
  tabLabelOn: { color: C.red },
  tabIndicator: { position: 'absolute', bottom: -8, width: 20, height: 3, backgroundColor: C.red, borderRadius: 2 },
  fab: { position: 'absolute', bottom: 90, right: 18, width: 52, height: 52, borderRadius: 26, backgroundColor: C.red, alignItems: 'center', justifyContent: 'center', shadowColor: C.red, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 8 },
  fabTxt: { color: '#fff', fontSize: 28, fontWeight: '300', lineHeight: 32 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.42)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 24 },
  sheetHandle: { width: 38, height: 4, backgroundColor: '#DDD', borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: C.red, textAlign: 'center', marginBottom: 4 },
  sheetSub: { fontSize: 13, color: C.t2, textAlign: 'center', marginBottom: 16 },
  label: { fontSize: 12, fontWeight: '700', color: C.t2, marginBottom: 6, marginTop: 8 },
  req: { color: C.red },
  input: { height: 46, backgroundColor: '#F4F5F7', borderRadius: 12, paddingHorizontal: 14, fontSize: 14, color: C.t1, borderWidth: 1, borderColor: '#E8EAED' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 4 },
  payRow: { flexDirection: 'row', gap: 8 },
  payOpt: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: '#DDD', alignItems: 'center' },
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
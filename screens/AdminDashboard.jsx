import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, ScrollView, Modal,
  RefreshControl, Linking, StatusBar, Platform
} from 'react-native';
import {
  getLatestLocations, getAllTrackingStatus, getVisits,
  getDeliveries, getNotPaidInvoices, getPaidInvoices,
  approvePayment, getNotifications, markNotificationsRead,
  createSalesman, getSalesmen, deleteSalesman, removeToken,
  getSalesmanCredentials, getSalesmanSummary, getSalesTarget,
  setSalesTarget, getSalesLog, getNotPaidSales, approveSalePayment,
  adminMarkPaid, approveVisitEdit, approveDeliveryEdit
} from '../services/api';

const C = {
  red: '#C0392B', redD: '#A93226', redL: '#FADBD8',
  navy: '#2C3E50', green: '#27AE60', greenL: '#D5F5E3',
  amber: '#F39C12', amberL: '#FDEBD0', destroy: '#EA4335',
  bg: '#F4F5F7', white: '#FFFFFF',
  t1: '#1A252F', t2: '#5D6D7E', t3: '#AAB7C4',
};

const COLORS = ['#8E44AD','#2980B9','#16A085','#D35400','#1A5276','#7D6608'];

const shadow = {
  shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.07, shadowRadius: 10, elevation: 3,
};

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

function formatDateFull(ts) {
  const src = asUTC(ts);
  if (!src) return '';
  const d = new Date(src.getTime() + (4 * 60 * 60 * 1000));
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const hh = d.getUTCHours().toString().padStart(2,'0');
  const mm = d.getUTCMinutes().toString().padStart(2,'0');
  return `${days[d.getUTCDay()]} ${d.getUTCDate()} ${months[d.getUTCMonth()]}, ${hh}:${mm}`;
}

function timeAgo(ts) {
  const src = asUTC(ts);
  if (!src) return '';
  const diff = Math.floor((Date.now() - src.getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function initials(name) {
  return (name || '').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

const TABS = [
  { key: 'salesmen', label: 'Salesmen' },
  { key: 'visits', label: 'Visits' },
  { key: 'deliveries', label: 'Deliveries' },
  { key: 'saleslog', label: 'Sales Log' },
  { key: 'notpaid', label: 'Not Paid' },
  { key: 'paid', label: 'Paid' },
];

const FILTERS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'older', label: 'Older' },
];

const DETAIL_FILTERS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'all', label: 'All Time' },
];

const filterScrollRefs = {};

function FilterBar({ selected, onSelect, filters = FILTERS, scrollId = 'default' }) {
  const selectedIndex = filters.findIndex(f => f.key === selected);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      style={styles.filterScroll} contentContainerStyle={{ paddingRight: 8 }}
      ref={ref => { filterScrollRefs[scrollId] = ref; }}
      onContentSizeChange={() => {
        if (selectedIndex > 2 && filterScrollRefs[scrollId]) filterScrollRefs[scrollId].scrollToEnd({ animated: false });
        else if (selectedIndex <= 1 && filterScrollRefs[scrollId]) filterScrollRefs[scrollId].scrollTo({ x: 0, animated: false });
      }}>
      {filters.map(f => (
        <TouchableOpacity key={f.key}
          style={[styles.filterPill, selected === f.key && styles.filterPillOn]}
          onPress={() => onSelect(f.key)}>
          <Text style={[styles.filterPillTxt, selected === f.key && styles.filterPillTxtOn]}>{f.label}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

function SearchBar({ value, onChange, placeholder }) {
  return (
    <View style={styles.searchBar}>
      <Text style={styles.searchIcon}>🔍</Text>
      <TextInput style={styles.searchInput} placeholder={placeholder}
        placeholderTextColor={C.t3} value={value} onChangeText={onChange}
        clearButtonMode="while-editing" />
    </View>
  );
}

export default function AdminDashboard({ navigation }) {
  const [tab, setTab] = useState('salesmen');
  const [salesmen, setSalesmen] = useState([]);
  const [trackingStatus, setTrackingStatus] = useState([]);
  const [locations, setLocations] = useState([]);
  const [allVisits, setAllVisits] = useState([]);
  const [allDeliveries, setAllDeliveries] = useState([]);
  const [allSalesLog, setAllSalesLog] = useState([]);
  const [notPaid, setNotPaid] = useState([]);
  const [notPaidSales, setNotPaidSales] = useState([]);
  const [paid, setPaid] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const [visitFilter, setVisitFilter] = useState('today');
  const [deliveryFilter, setDeliveryFilter] = useState('today');
  const [salesLogFilter, setSalesLogFilter] = useState('today');
  const [visitSearch, setVisitSearch] = useState('');
  const [deliverySearch, setDeliverySearch] = useState('');
  const [salesLogSearch, setSalesLogSearch] = useState('');
  const [notPaidSearch, setNotPaidSearch] = useState('');
  const [paidSearch, setPaidSearch] = useState('');
  const [paidFilter, setPaidFilter] = useState('month');

  const [notifModal, setNotifModal] = useState(false);
  const [addModal, setAddModal] = useState(false);
  const [detailModal, setDetailModal] = useState(false);
  const [selectedSalesman, setSelectedSalesman] = useState(null);
  const [salesmanVisits, setSalesmanVisits] = useState([]);
  const [salesmanDeliveries, setSalesmanDeliveries] = useState([]);
  const [detailFilter, setDetailFilter] = useState('today');
  const [salesmanSummary, setSalesmanSummary] = useState(null);
  const [salesmanTarget, setSalesmanTarget] = useState({ target_amount: 0, achieved_amount: 0 });
  const [targetInput, setTargetInput] = useState('');
  const [targetSaving, setTargetSaving] = useState(false);

  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [credentials, setCredentials] = useState(null);
  const [credLoading, setCredLoading] = useState(false);

  const [adminPayModal, setAdminPayModal] = useState(false);
  const [adminPayInv, setAdminPayInv] = useState(null);
  const [adminPayType, setAdminPayType] = useState('cash');
  const [adminCashType, setAdminCashType] = useState('cash');

  useEffect(() => {
    loadAll();
    const iv = setInterval(loadAll, 30000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => { loadVisits(); }, [visitFilter]);
  useEffect(() => { loadDeliveries(); }, [deliveryFilter]);
  useEffect(() => { loadSalesLogAll(); }, [salesLogFilter]);
  useEffect(() => { loadPaid(); }, [paidFilter]);
  useEffect(() => {
    if (selectedSalesman?.id) { loadSalesmanDetail(); loadSalesmanSummary(); loadSalesmanTarget(); }
  }, [detailFilter, selectedSalesman?.id]);

  const loadAll = async () => {
    try {
      const [sm, ts, locs, np, nps, notifs] = await Promise.all([
        getSalesmen(), getAllTrackingStatus(), getLatestLocations(),
        getNotPaidInvoices(), getNotPaidSales(), getNotifications(),
      ]);
      setSalesmen(sm); setTrackingStatus(ts); setLocations(locs);
      setNotPaid(np); setNotPaidSales(nps); setNotifications(notifs);
      setUnreadCount(notifs.filter(n => !n.is_read).length);
    } catch (e) {
      console.log('loadAll error:', e?.response?.status, e?.response?.data);
      if (e?.response?.status === 401) { await removeToken(); navigation.replace('Login'); }
    }
  };

  const loadVisits = async () => { try { setAllVisits(await getVisits(visitFilter)); } catch (e) { console.log(e); } };
  const loadDeliveries = async () => { try { setAllDeliveries(await getDeliveries(deliveryFilter)); } catch (e) { console.log(e); } };
  const loadSalesLogAll = async () => { try { setAllSalesLog(await getSalesLog(salesLogFilter)); } catch (e) { console.log(e); } };
  const loadPaid = async () => { try { setPaid(await getPaidInvoices(paidFilter)); } catch (e) { console.log(e); } };

  const loadSalesmanDetail = async () => {
    if (!selectedSalesman) return;
    try {
      const [v, d] = await Promise.all([
        getVisits(detailFilter === 'all' ? undefined : detailFilter, selectedSalesman.id),
        getDeliveries(detailFilter === 'all' ? undefined : detailFilter, selectedSalesman.id),
      ]);
      setSalesmanVisits(v || []); setSalesmanDeliveries(d || []);
    } catch (e) { console.log('loadSalesmanDetail error:', e?.response?.data || e.message); }
  };

  const loadSalesmanSummary = async () => {
    if (!selectedSalesman) return;
    try { setSalesmanSummary(await getSalesmanSummary(selectedSalesman.id)); }
    catch (e) { console.log(e); }
  };

  const loadSalesmanTarget = async () => {
    if (!selectedSalesman) return;
    try {
      const data = await getSalesTarget(selectedSalesman.id);
      setSalesmanTarget(data); setTargetInput(String(data.target_amount || ''));
    } catch (e) { console.log(e); }
  };

  const handleSaveTarget = async () => {
    if (!selectedSalesman) return;
    const amount = Number(targetInput);
    if (isNaN(amount) || amount < 0) return Alert.alert('Invalid', 'Enter a valid target amount');
    setTargetSaving(true);
    try {
      const month = new Date().toISOString().slice(0, 7) + '-01';
      await setSalesTarget(selectedSalesman.id, month, amount);
      await loadSalesmanTarget();
      Alert.alert('Saved', 'Sales target updated');
    } catch (e) { Alert.alert('Error', 'Failed to save target'); }
    finally { setTargetSaving(false); }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAll(); await loadVisits(); await loadDeliveries();
    await loadSalesLogAll(); await loadPaid();
    setRefreshing(false);
  };

  const handleOpenNotifs = async () => {
    setNotifModal(true);
    setUnreadCount(0);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    try { await markNotificationsRead(); } catch (e) { console.log(e); }
  };

  const handleAddSalesman = async () => {
    if (!newName || !newEmail || !newPassword) return Alert.alert('Error', 'All fields are required');
    setAddLoading(true);
    try {
      const res = await createSalesman(newName, newEmail, newPassword);
      if (newTarget && Number(newTarget) > 0) {
        const month = new Date().toISOString().slice(0, 7) + '-01';
        await setSalesTarget(res.user.id, month, Number(newTarget));
      }
      setAddModal(false);
      setNewName(''); setNewEmail(''); setNewPassword(''); setNewTarget('');
      const sm = await getSalesmen(); setSalesmen(sm);
      const ts = await getAllTrackingStatus(); setTrackingStatus(ts);
      Alert.alert('Success', `Account created for ${newName}`);
    } catch (e) { Alert.alert('Error', e.response?.data?.error || 'Failed to create account'); }
    finally { setAddLoading(false); }
  };

  const handleDeleteSalesman = (s) => {
    Alert.alert('Delete Salesman', `Delete ${s.name}? Their visit and delivery records will be kept.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await deleteSalesman(s.id);
          const sm = await getSalesmen(); setSalesmen(sm);
          const ts = await getAllTrackingStatus(); setTrackingStatus(ts);
          setDetailModal(false);
        } catch (e) { Alert.alert('Error', 'Failed to delete salesman'); }
      }}
    ]);
  };

  const handleViewCredentials = async (s) => {
    setCredLoading(true); setCredentials(null);
    try { setCredentials(await getSalesmanCredentials(s.id)); }
    catch (e) { Alert.alert('Error', 'Could not load credentials'); }
    finally { setCredLoading(false); }
  };

  const handleApprove = async (inv) => {
    Alert.alert('Approve Payment', `Approve ${inv.invoice_number}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Approve', onPress: async () => {
        try {
          if (inv._source === 'sales') {
            await approveSalePayment(inv.id);
            setNotPaidSales(prev => prev.filter(i => i.id !== inv.id));
          } else {
            await approvePayment(inv.id);
            setNotPaid(prev => prev.filter(i => i.id !== inv.id));
          }
          loadPaid(); loadAll();
        } catch (e) { Alert.alert('Error', 'Failed to approve'); }
      }}
    ]);
  };

  const handleAdminMarkPaid = async () => {
    const pm = adminPayType === 'cash' ? adminCashType : adminPayType;
    try {
      await adminMarkPaid(adminPayInv.id, pm);
      setNotPaid(prev => prev.filter(i => i.id !== adminPayInv.id));
      setAdminPayModal(false);
      loadPaid(); loadAll();
      Alert.alert('Done', 'Invoice marked as paid.');
    } catch (e) { Alert.alert('Error', 'Failed to mark as paid'); }
  };

  const handleApproveEdit = async (type, id, approve) => {
    try {
      if (type === 'visit') await approveVisitEdit(id, approve);
      else await approveDeliveryEdit(id, approve);
      await loadVisits(); await loadDeliveries();
      Alert.alert(approve ? 'Approved' : 'Rejected', `Edit ${approve ? 'approved' : 'rejected'}.`);
    } catch (e) { Alert.alert('Error', 'Failed to process edit'); }
  };

  const openMap = (lat, lng, name) =>
    Linking.openURL(`https://www.google.com/maps?q=${lat},${lng}&label=${name}`);

  const getTracking = (id) => trackingStatus.find(t => t.user_id === id);
  const getLocation = (id) => locations.find(l => l.user_id === id);

  const searchFilter = (list, term, keys) => {
    if (!term.trim()) return list;
    const t = term.toLowerCase();
    return list.filter(item => keys.some(k => (item[k] || item.users?.name || '').toLowerCase().includes(t)));
  };

  const filteredVisits = searchFilter(allVisits, visitSearch, ['company_name','contact_name','mobile','email_id']);
  const filteredDeliveries = searchFilter(allDeliveries, deliverySearch, ['invoice_number','company_name','delivered_person','payment_method']);
  const filteredSalesLog = searchFilter(allSalesLog, salesLogSearch, ['invoice_number','company_name','delivered_to','payment_method']);
  const mergedNotPaid = [
    ...notPaid.map(i => ({ ...i, _source: 'delivery', _to: i.delivered_person })),
    ...notPaidSales.map(i => ({ ...i, _source: 'sales', _to: i.delivered_to })),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const filteredNotPaid = searchFilter(mergedNotPaid, notPaidSearch, ['invoice_number','_to']);
  const filteredPaid = searchFilter(paid, paidSearch, ['invoice_number','delivered_person','payment_method']);

  const pmLabel = (pm) => {
    if (pm === 'bank') return 'Bank Transfer';
    if (pm === 'not_paid') return 'Not Paid';
    if (!pm) return '—';
    return pm.charAt(0).toUpperCase() + pm.slice(1);
  };

  const salesmanColor = (id, fallbackName) => {
    const idx = salesmen.findIndex(s => s.id === id);
    if (idx >= 0) return COLORS[idx % COLORS.length];
    if (fallbackName) {
      let hash = 0;
      for (let i = 0; i < fallbackName.length; i++) hash += fallbackName.charCodeAt(i);
      return COLORS[hash % COLORS.length];
    }
    return '#AAB7C4';
  };

  const EditPendingSection = ({ item, type }) => {
    if (item.edit_status !== 'pending') return null;
    let pending = {};
    try { pending = JSON.parse(item.pending_edit || '{}'); } catch {}
    return (
      <View style={{ backgroundColor: '#FFF8E1', borderRadius: 10, padding: 10, marginTop: 8 }}>
        <Text style={{ fontSize: 11, fontWeight: '700', color: '#7D6608', marginBottom: 4 }}>
          ⏳ Edit requested by {pending.requested_by}
        </Text>
        <Text style={{ fontSize: 11, color: C.t2, marginBottom: 4 }}>Before:</Text>
        {Object.entries(pending.original || {}).map(([k, v]) => (
          <Text key={`orig-${k}`} style={{ fontSize: 11, color: C.t2 }}>{k.replace(/_/g,' ')}: {String(v)}</Text>
        ))}
        <Text style={{ fontSize: 11, color: C.t2, marginTop: 6, marginBottom: 4 }}>After:</Text>
        {Object.entries(pending.proposed || {}).map(([k, v]) => (
          <Text key={`prop-${k}`} style={{ fontSize: 11, color: C.t1, fontWeight: '600' }}>{k.replace(/_/g,' ')}: {String(v)}</Text>
        ))}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <TouchableOpacity style={[styles.approveBtn, { flex: 1 }]} onPress={() => handleApproveEdit(type, item.id, true)}>
            <Text style={styles.approveTxt}>✓ Approve Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.approveBtn, { flex: 1, backgroundColor: C.destroy }]} onPress={() => handleApproveEdit(type, item.id, false)}>
            <Text style={styles.approveTxt}>✗ Reject</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const AdminPayTypeSelector = ({ type, setType, cashT, setCashT }) => (
    <View>
      <View style={styles.payRow}>
        {[['cash','Cash'],['credit','Credit'],['bank','Bank Transfer']].map(([val,lbl]) => (
          <TouchableOpacity key={val}
            style={[styles.filterPill, type===val && styles.filterPillOn, { flex: 1, justifyContent: 'center', alignItems: 'center' }]}
            onPress={() => setType(val)}>
            <Text style={[styles.filterPillTxt, type===val && styles.filterPillTxtOn]}>{lbl}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {type === 'cash' && (
        <View style={[styles.payRow, { marginTop: 8 }]}>
          {[['cash','Cash'],['bank','Bank Transfer']].map(([val,lbl]) => (
            <TouchableOpacity key={val}
              style={[styles.filterPill, cashT===val && styles.filterPillOn, { flex: 1, justifyContent: 'center', alignItems: 'center' }]}
              onPress={() => setCashT(val)}>
              <Text style={[styles.filterPillTxt, cashT===val && styles.filterPillTxtOn]}>{lbl}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={C.white} />

      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Admin Dashboard</Text>
          <Text style={styles.subtitle}>Al Sahal Printing Press</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={handleOpenNotifs} style={styles.notifWrap}>
            <Text style={styles.notifIcon}>🔔</Text>
            {unreadCount > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeTxt}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => Alert.alert('Sign out', 'Are you sure?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Sign Out', style: 'destructive', onPress: async () => { await removeToken(); navigation.replace('Login'); } }
            ])}
            style={styles.logoutBtn}>
            <Text style={styles.logoutTxt}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Stat cards */}
      <View style={styles.statsRow}>
        <View style={[styles.statCard, { borderTopColor: C.navy }]}>
          <Text style={[styles.statVal, { color: C.navy }]}>{salesmen.length}</Text>
          <Text style={styles.statLbl}>Salesmen</Text>
        </View>
        <View style={[styles.statCard, { borderTopColor: C.green }]}>
          <Text style={[styles.statVal, { color: C.green }]}>{trackingStatus.filter(t => t.is_tracking).length}</Text>
          <Text style={styles.statLbl}>Active</Text>
        </View>
        <View style={[styles.statCard, { borderTopColor: C.red }]}>
          <Text style={[styles.statVal, { color: C.red }]}>
            {notPaid.filter(i => i.status === 'not_paid').length + notPaidSales.filter(i => i.status === 'not_paid').length}
          </Text>
          <Text style={styles.statLbl}>Not Paid</Text>
        </View>
      </View>

      {/* Tab nav */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.navScroll}>
        {TABS.map(t => (
          <TouchableOpacity key={t.key}
            style={[styles.navTab, tab === t.key && styles.navTabOn]}
            onPress={() => setTab(t.key)}>
            <Text style={[styles.navTabTxt, tab === t.key && styles.navTabTxtOn]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── Salesmen tab ── */}
      {tab === 'salesmen' && (
        <ScrollView style={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
          <TouchableOpacity style={styles.addSalesBtn} onPress={() => setAddModal(true)}>
            <Text style={styles.addSalesTxt}>+ Add New Salesman</Text>
          </TouchableOpacity>
          <View style={styles.salesGrid}>
            {salesmen.map((s, i) => {
              const tr = getTracking(s.id);
              const loc = getLocation(s.id);
              const isOn = tr?.is_tracking;
              const col = COLORS[i % COLORS.length];
              return (
                <TouchableOpacity key={s.id} style={[styles.salesCard, { borderLeftColor: col }]}
                  onPress={() => { setSelectedSalesman(s); setDetailFilter('today'); setDetailModal(true); }}>
                  <View style={styles.salesCardTop}>
                    <View style={[styles.av, { backgroundColor: col }]}>
                      <Text style={styles.avTxt}>{initials(s.name)}</Text>
                    </View>
                    <View style={[styles.trackDotWrap, { backgroundColor: isOn ? C.greenL : C.redL }]}>
                      <View style={[styles.trackDot, { backgroundColor: isOn ? C.green : C.destroy }]} />
                    </View>
                  </View>
                  <Text style={styles.salesName} numberOfLines={1}>{s.name}</Text>
                  <Text style={styles.salesSub}>{isOn ? 'Tracking ON' : 'Tracking OFF'}</Text>
                  {loc && isOn && (
                    <TouchableOpacity style={styles.mapBtn} onPress={() => openMap(loc.lat, loc.lng, s.name)}>
                      <Text style={styles.mapBtnTxt}>📍 Live location</Text>
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      )}

      {/* ── Visits tab ── */}
      {tab === 'visits' && (
        <>
          <FilterBar selected={visitFilter} onSelect={setVisitFilter} scrollId="visits" />
          <View style={styles.searchWrap}>
            <SearchBar value={visitSearch} onChange={setVisitSearch} placeholder="Search company, salesman, contact…" />
          </View>
          <ScrollView style={styles.scroll}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
            <Text style={styles.resultCount}>{filteredVisits.length} visits</Text>
            {filteredVisits.map((v) => {
              const col = salesmanColor(v.user_id, v.salesman_name);
              return (
                <View key={v.id} style={[styles.card, styles.cardLeft, { borderLeftColor: col }]}>
                  <View style={styles.cardTopRow}>
                    <Text style={styles.cardTitle}>{v.company_name}</Text>
                    <View style={[styles.salesBadge, { backgroundColor: col + '22' }]}>
                      <Text style={[styles.salesBadgeTxt, { color: col }]}>
                        {v.users?.name?.split(' ')[0] || v.salesman_name?.split(' ')[0] || 'Deleted'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.cardDetail}>{v.contact_name}  ·  {v.mobile}</Text>
                  {v.email_id ? <Text style={styles.cardDetail}>{v.email_id}</Text> : null}
                  {v.quotation && (
                    <View style={[styles.badge, { backgroundColor: '#EAF0FB', marginTop: 6 }]}>
                      <Text style={[styles.badgeTxt, { color: '#1A5276' }]}>Quotation: {v.quotation_description}</Text>
                    </View>
                  )}
                  {v.lat && v.lng && (
                    <TouchableOpacity style={styles.mapBtn}
                      onPress={() => Linking.openURL(`https://www.google.com/maps?q=${v.lat},${v.lng}&label=${v.company_name}`)}>
                      <Text style={styles.mapBtnTxt}>📍 View visit location</Text>
                    </TouchableOpacity>
                  )}
                  <EditPendingSection item={v} type="visit" />
                  <Text style={styles.cardTime}>{formatDate(v.visited_at)}</Text>
                </View>
              );
            })}
            {filteredVisits.length === 0 && <Text style={styles.empty}>No visits found</Text>}
            <View style={{ height: 20 }} />
          </ScrollView>
        </>
      )}

      {/* ── Deliveries tab ── */}
      {tab === 'deliveries' && (
        <>
          <FilterBar selected={deliveryFilter} onSelect={setDeliveryFilter} scrollId="deliveries" />
          <View style={styles.searchWrap}>
            <SearchBar value={deliverySearch} onChange={setDeliverySearch} placeholder="Search invoice, salesman, company…" />
          </View>
          <ScrollView style={styles.scroll}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
            <Text style={styles.resultCount}>{filteredDeliveries.length} deliveries</Text>
            {filteredDeliveries.map((d) => {
              const col = salesmanColor(d.user_id, d.salesman_name);
              const sc = d.status === 'paid'
                ? { bg: C.greenL, txt: '#145A32', lbl: '✓ Paid' }
                : d.status === 'pending_approval'
                ? { bg: C.amberL, txt: '#784212', lbl: '⏳ Pending' }
                : { bg: C.redL, txt: C.redD, lbl: '✗ Not Paid' };
              return (
                <View key={d.id} style={[styles.card, styles.cardLeft, { borderLeftColor: col }]}>
                  <View style={styles.cardTopRow}>
                    <Text style={styles.cardTitle}>{d.invoice_number}</Text>
                    <View style={[styles.salesBadge, { backgroundColor: col + '22' }]}>
                      <Text style={[styles.salesBadgeTxt, { color: col }]}>
                        {d.users?.name?.split(' ')[0] || d.salesman_name?.split(' ')[0] || 'Deleted'}
                      </Text>
                    </View>
                  </View>
                  {d.company_name ? <Text style={styles.cardDetail}>Company: {d.company_name}</Text> : null}
                  <Text style={styles.cardDetail}>Delivered to: {d.delivered_person}</Text>
                  <Text style={styles.cardDetail}>Payment: {pmLabel(d.payment_method)}</Text>
                  <View style={[styles.badge, { backgroundColor: sc.bg, marginTop: 6 }]}>
                    <Text style={[styles.badgeTxt, { color: sc.txt }]}>{sc.lbl}</Text>
                  </View>
                  {d.lat && d.lng && (
                    <TouchableOpacity style={styles.mapBtn}
                      onPress={() => Linking.openURL(`https://www.google.com/maps?q=${d.lat},${d.lng}&label=${d.invoice_number}`)}>
                      <Text style={styles.mapBtnTxt}>📍 View delivery location</Text>
                    </TouchableOpacity>
                  )}
                  <EditPendingSection item={d} type="delivery" />
                  <Text style={styles.cardTime}>{formatDate(d.created_at)}</Text>
                </View>
              );
            })}
            {filteredDeliveries.length === 0 && <Text style={styles.empty}>No deliveries found</Text>}
            <View style={{ height: 20 }} />
          </ScrollView>
        </>
      )}

      {/* ── Sales Log tab ── */}
      {tab === 'saleslog' && (
        <>
          <FilterBar selected={salesLogFilter} onSelect={setSalesLogFilter} scrollId="saleslog" />
          <View style={styles.searchWrap}>
            <SearchBar value={salesLogSearch} onChange={setSalesLogSearch} placeholder="Search invoice, salesman, company…" />
          </View>
          <ScrollView style={styles.scroll}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
            <Text style={styles.resultCount}>{filteredSalesLog.length} sales</Text>
            {filteredSalesLog.map((s) => {
              const col = salesmanColor(s.user_id, s.salesman_name);
              const sc = s.status === 'paid'
                ? { bg: C.greenL, txt: '#145A32', lbl: '✓ Paid' }
                : s.status === 'pending_approval'
                ? { bg: C.amberL, txt: '#784212', lbl: '⏳ Pending' }
                : { bg: C.redL, txt: C.redD, lbl: '✗ Not Paid' };
              return (
                <View key={s.id} style={[styles.card, styles.cardLeft, { borderLeftColor: col }]}>
                  <View style={styles.cardTopRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                      <Text style={styles.cardTitle}>{s.invoice_number}</Text>
                      {s.source === 'delivery' && (
                        <View style={[styles.badge, { backgroundColor: '#F4ECFB' }]}>
                          <Text style={[styles.badgeTxt, { color: '#5B2C6F' }]}>From Delivery</Text>
                        </View>
                      )}
                    </View>
                    <View style={[styles.salesBadge, { backgroundColor: col + '22' }]}>
                      <Text style={[styles.salesBadgeTxt, { color: col }]}>
                        {s.users?.name?.split(' ')[0] || s.salesman_name?.split(' ')[0] || 'Deleted'}
                      </Text>
                    </View>
                  </View>
                  {s.company_name ? <Text style={styles.cardDetail}>Company: {s.company_name}</Text> : null}
                  <Text style={styles.cardDetail}>Delivered to: {s.delivered_to}</Text>
                  <Text style={styles.cardDetail}>Amount: {Number(s.amount || 0).toFixed(2)} OMR</Text>
                  <Text style={styles.cardDetail}>Payment: {pmLabel(s.payment_method)}</Text>
                  <View style={[styles.badge, { backgroundColor: sc.bg, marginTop: 6 }]}>
                    <Text style={[styles.badgeTxt, { color: sc.txt }]}>{sc.lbl}</Text>
                  </View>
                  <Text style={styles.cardTime}>{formatDate(s.created_at)}</Text>
                </View>
              );
            })}
            {filteredSalesLog.length === 0 && <Text style={styles.empty}>No sales found</Text>}
            <View style={{ height: 20 }} />
          </ScrollView>
        </>
      )}

      {/* ── Not Paid tab ── */}
      {tab === 'notpaid' && (
        <>
          <View style={styles.searchWrap}>
            <SearchBar value={notPaidSearch} onChange={setNotPaidSearch} placeholder="Search invoice, salesman, company…" />
          </View>
          <ScrollView style={styles.scroll}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
            <Text style={styles.resultCount}>{filteredNotPaid.length} unpaid invoices</Text>
            {filteredNotPaid.map((inv) => {
              const isPending = inv.status === 'pending_approval';
              const col = salesmanColor(inv.user_id, inv.salesman_name);
              return (
                <View key={`${inv._source}-${inv.id}`} style={[styles.card, styles.cardLeft,
                  { borderLeftColor: isPending ? C.amber : C.red }]}>
                  <View style={styles.cardTopRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                      <Text style={styles.cardTitle}>{inv.invoice_number}</Text>
                      <View style={[styles.badge, { backgroundColor: inv._source === 'sales' ? '#EAF0FB' : '#F4ECFB' }]}>
                        <Text style={[styles.badgeTxt, { color: inv._source === 'sales' ? '#1A5276' : '#5B2C6F' }]}>
                          {inv._source === 'sales' ? 'Sale' : 'Delivery'}
                        </Text>
                      </View>
                    </View>
                    <View style={[styles.salesBadge, { backgroundColor: col + '22' }]}>
                      <Text style={[styles.salesBadgeTxt, { color: col }]}>
                        {inv.users?.name?.split(' ')[0] || inv.salesman_name?.split(' ')[0] || 'Deleted'}
                      </Text>
                    </View>
                  </View>
                  {inv.company_name ? <Text style={styles.cardDetail}>Company: {inv.company_name}</Text> : null}
                  <Text style={styles.cardDetail}>Delivered to: {inv._to}</Text>
                  {inv.amount > 0 && <Text style={styles.cardDetail}>Amount: {Number(inv.amount).toFixed(2)} OMR</Text>}
                  {isPending && <Text style={styles.cardDetail}>Method claimed: {pmLabel(inv.payment_method)}</Text>}
                  <View style={[styles.badge, { backgroundColor: isPending ? C.amberL : C.redL, marginTop: 6 }]}>
                    <Text style={[styles.badgeTxt, { color: isPending ? '#784212' : C.redD }]}>
                      {isPending ? '⏳ Pending approval' : '✗ Not Paid'}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                    {isPending && (
                      <TouchableOpacity style={[styles.approveBtn, { flex: 1 }]} onPress={() => handleApprove(inv)}>
                        <Text style={styles.approveTxt}>✓ Approve</Text>
                      </TouchableOpacity>
                    )}
                    {inv._source === 'delivery' && inv.status !== 'paid' && (
                      <TouchableOpacity
                        style={[styles.approveBtn, { flex: 1, backgroundColor: C.navy }]}
                        onPress={() => { setAdminPayInv(inv); setAdminPayType('cash'); setAdminCashType('cash'); setAdminPayModal(true); }}>
                        <Text style={styles.approveTxt}>💳 Mark Paid</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <Text style={styles.cardTime}>{formatDate(inv.created_at)}</Text>
                </View>
              );
            })}
            {filteredNotPaid.length === 0 && <Text style={styles.empty}>No unpaid invoices 🎉</Text>}
            <View style={{ height: 20 }} />
          </ScrollView>
        </>
      )}

      {/* ── Paid tab ── */}
      {tab === 'paid' && (
        <>
          <FilterBar selected={paidFilter} onSelect={setPaidFilter} scrollId="paid"
            filters={[{ key: 'week', label: 'This Week' }, { key: 'month', label: 'This Month' }, { key: 'older', label: 'Older' }]} />
          <View style={styles.searchWrap}>
            <SearchBar value={paidSearch} onChange={setPaidSearch} placeholder="Search invoice, salesman, method…" />
          </View>
          <ScrollView style={styles.scroll}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
            <Text style={styles.resultCount}>{filteredPaid.length} paid invoices</Text>
            {filteredPaid.map((inv) => {
              const col = salesmanColor(inv.user_id, inv.salesman_name);
              return (
                <View key={inv.id} style={[styles.card, styles.cardLeft, { borderLeftColor: C.green }]}>
                  <View style={styles.cardTopRow}>
                    <Text style={styles.cardTitle}>{inv.invoice_number}</Text>
                    <View style={[styles.salesBadge, { backgroundColor: col + '22' }]}>
                      <Text style={[styles.salesBadgeTxt, { color: col }]}>
                        {inv.users?.name?.split(' ')[0] || inv.salesman_name?.split(' ')[0] || 'Deleted'}
                      </Text>
                    </View>
                  </View>
                  {inv.company_name ? <Text style={styles.cardDetail}>Company: {inv.company_name}</Text> : null}
                  <Text style={styles.cardDetail}>Delivered to: {inv.delivered_person}</Text>
                  <Text style={styles.cardDetail}>Payment: {pmLabel(inv.payment_method)}</Text>
                  {inv.approved_at && <Text style={styles.cardDetail}>Approved: {formatDate(inv.approved_at)}</Text>}
                  <View style={[styles.badge, { backgroundColor: C.greenL, marginTop: 6 }]}>
                    <Text style={[styles.badgeTxt, { color: '#145A32' }]}>✓ Paid & Approved</Text>
                  </View>
                  <Text style={styles.cardTime}>{formatDate(inv.created_at)}</Text>
                </View>
              );
            })}
            {filteredPaid.length === 0 && <Text style={styles.empty}>No paid invoices found</Text>}
            <View style={{ height: 20 }} />
          </ScrollView>
        </>
      )}

      {/* ── Notifications Modal ── */}
      <Modal visible={notifModal} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { maxHeight: '82%' }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.notifHeader}>
              <Text style={styles.sheetTitle}>Notifications</Text>
              <TouchableOpacity onPress={() => setNotifModal(false)}>
                <Text style={styles.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView>
              {notifications.length === 0 && <Text style={styles.empty}>No notifications</Text>}
              {notifications.slice(0, 15).map(n => (
                <View key={n.id} style={[styles.notifItem,
                  { borderLeftColor: n.type === 'tracking_on' ? C.green
                    : n.type === 'tracking_off' ? C.destroy
                    : n.type === 'edit_request' ? C.navy
                    : C.amber },
                  !n.is_read && styles.notifUnread]}>
                  <Text style={styles.notifMsg}>{n.message}</Text>
                  <Text style={styles.notifTime}>{formatDateFull(n.created_at)}  ·  {timeAgo(n.created_at)}</Text>
                </View>
              ))}
              {notifications.length > 15 && (
                <Text style={styles.moreNotifs}>+ {notifications.length - 15} older notifications</Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Add Salesman Modal ── */}
      <Modal visible={addModal} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Add Salesman</Text>
            <Text style={styles.label}>Full Name <Text style={styles.req}>*</Text></Text>
            <TextInput style={styles.input} placeholder="Full name" placeholderTextColor={C.t3} value={newName} onChangeText={setNewName} />
            <Text style={styles.label}>Email <Text style={styles.req}>*</Text></Text>
            <TextInput style={styles.input} placeholder="email@alsahal.com" placeholderTextColor={C.t3} value={newEmail} onChangeText={setNewEmail} keyboardType="email-address" autoCapitalize="none" />
            <Text style={styles.label}>Password <Text style={styles.req}>*</Text></Text>
            <TextInput style={styles.input} placeholder="••••••••" placeholderTextColor={C.t3} value={newPassword} onChangeText={setNewPassword} secureTextEntry />
            <Text style={styles.label}>Sales Target — this month (OMR)</Text>
            <TextInput style={styles.input} placeholder="Optional" placeholderTextColor={C.t3} value={newTarget} onChangeText={setNewTarget} keyboardType="decimal-pad" />
            <View style={styles.infoBox}>
              <Text style={styles.infoTxt}>Only admin can create salesman accounts.</Text>
            </View>
            <TouchableOpacity style={styles.submitBtn} onPress={handleAddSalesman} disabled={addLoading}>
              {addLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitTxt}>Create Account</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setAddModal(false)}>
              <Text style={styles.cancelTxt}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Salesman Detail Modal ── */}
      <Modal visible={detailModal} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { maxHeight: '92%', flex: 1, flexShrink: 1 }]}>
            <View style={styles.sheetHandle} />
            {selectedSalesman && (() => {
              const col = COLORS[salesmen.findIndex(s => s.id === selectedSalesman.id) % COLORS.length] || '#8E44AD';
              const tr = getTracking(selectedSalesman.id);
              const loc = getLocation(selectedSalesman.id);
              const isOn = tr?.is_tracking;
              const uniqueCompanies = [...new Set(salesmanVisits.map(v => v.company_name))].length;
              return (
                <>
                  <View style={styles.detailHeader}>
                    <View style={[styles.av, { backgroundColor: col, width: 48, height: 48, borderRadius: 24 }]}>
                      <Text style={[styles.avTxt, { fontSize: 18 }]}>{initials(selectedSalesman.name)}</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.detailName}>{selectedSalesman.name}</Text>
                      <Text style={{ fontSize: 11, color: C.t2, marginTop: 1 }}>{selectedSalesman.email}</Text>
                      <View style={styles.trackRow}>
                        <View style={[styles.trackDot, { backgroundColor: isOn ? C.green : C.destroy }]} />
                        <Text style={[styles.trackTxt, { color: isOn ? C.green : C.destroy }]}>
                          {isOn ? 'Active' : 'Inactive'}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity onPress={() => { setDetailModal(false); setCredentials(null); }}>
                      <Text style={styles.closeBtn}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                    <TouchableOpacity style={styles.credBtn} onPress={() => handleViewCredentials(selectedSalesman)}>
                      <Text style={styles.credBtnTxt}>
                        {credLoading ? 'Loading…' : credentials
                          ? `📧 ${credentials.email}   🔑 ${credentials.password_plain || '(not stored)'}`
                          : '👁 View Login Credentials'}
                      </Text>
                    </TouchableOpacity>

                    {/* Target */}
                    <View style={styles.targetBox}>
                      <Text style={styles.sectionLabelSm}>SALES TARGET · THIS MONTH</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginTop: 2 }}>
                        <Text style={styles.targetAchieved}>{Number(salesmanTarget.achieved_amount || 0).toFixed(0)}</Text>
                        <Text style={styles.targetSlash}>/ {Number(salesmanTarget.target_amount || 0).toFixed(0)} OMR</Text>
                      </View>
                      <View style={styles.targetBarBg}>
                        <View style={[styles.targetBarFill, {
                          width: `${salesmanTarget.target_amount > 0 ? Math.min(100, (salesmanTarget.achieved_amount / salesmanTarget.target_amount) * 100) : 0}%`
                        }]} />
                      </View>
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                        <TextInput style={[styles.input, { flex: 1, height: 40 }]}
                          placeholder="Set new target (OMR)" placeholderTextColor={C.t3}
                          value={targetInput} onChangeText={setTargetInput} keyboardType="decimal-pad" />
                        <TouchableOpacity style={styles.targetSaveBtn} onPress={handleSaveTarget} disabled={targetSaving}>
                          {targetSaving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.targetSaveTxt}>Save</Text>}
                        </TouchableOpacity>
                      </View>
                    </View>

                    {salesmanSummary && (
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryTxt}>Today: {salesmanSummary.visits_today} visits · {salesmanSummary.deliveries_today} deliveries</Text>
                        <Text style={styles.summaryTxt}>All-time: {salesmanSummary.visits_total} visits · {salesmanSummary.deliveries_total} deliveries</Text>
                      </View>
                    )}

                    <View style={[styles.statsRow, { backgroundColor: 'transparent', borderBottomWidth: 0, padding: 0, paddingBottom: 8 }]}>
                      <View style={styles.statCard}>
                        <Text style={[styles.statVal, { color: C.navy, fontSize: 20 }]}>{salesmanVisits.length}</Text>
                        <Text style={styles.statLbl}>Visits</Text>
                      </View>
                      <View style={styles.statCard}>
                        <Text style={[styles.statVal, { color: C.green, fontSize: 20 }]}>{uniqueCompanies}</Text>
                        <Text style={styles.statLbl}>Companies</Text>
                      </View>
                      <View style={styles.statCard}>
                        <Text style={[styles.statVal, { color: C.red, fontSize: 20 }]}>{salesmanDeliveries.length}</Text>
                        <Text style={styles.statLbl}>Deliveries</Text>
                      </View>
                    </View>

                    {isOn && (
                      <TouchableOpacity style={styles.liveLocBtn}
                        onPress={() => loc ? openMap(loc.lat, loc.lng, selectedSalesman.name) : Alert.alert('No location', 'No location data yet')}>
                        <Text style={styles.liveLocTxt}>📍 Live Location {loc ? `· ${timeAgo(loc.recorded_at)}` : '· No data yet'}</Text>
                      </TouchableOpacity>
                    )}

                    <FilterBar selected={detailFilter} onSelect={setDetailFilter} filters={DETAIL_FILTERS} />

                    {salesmanVisits.length === 0 && salesmanDeliveries.length === 0 &&
                      <Text style={styles.empty}>No activity found</Text>}

                    {salesmanVisits.map((v) => (
                      <View key={v.id} style={[styles.card, styles.cardLeft, { borderLeftColor: col }]}>
                        <View style={styles.cardTopRow}>
                          <Text style={styles.cardTitle}>{v.company_name}</Text>
                          <View style={[styles.badge, { backgroundColor: '#EAF0FB' }]}>
                            <Text style={[styles.badgeTxt, { color: '#1A5276' }]}>Visit</Text>
                          </View>
                        </View>
                        <Text style={styles.cardDetail}>{v.contact_name}  ·  {v.mobile}</Text>
                        {v.email_id ? <Text style={styles.cardDetail}>{v.email_id}</Text> : null}
                        {v.quotation && <Text style={styles.cardDetail}>Quotation: {v.quotation_description}</Text>}
                        {v.lat && v.lng && (
                          <TouchableOpacity style={styles.mapBtn}
                            onPress={() => Linking.openURL(`https://www.google.com/maps?q=${v.lat},${v.lng}&label=${v.company_name}`)}>
                            <Text style={styles.mapBtnTxt}>📍 View visit location</Text>
                          </TouchableOpacity>
                        )}
                        <Text style={styles.cardTime}>{formatDate(v.visited_at)}</Text>
                      </View>
                    ))}

                    {salesmanDeliveries.map((d) => (
                      <View key={d.id} style={[styles.card, styles.cardLeft, { borderLeftColor: col }]}>
                        <View style={styles.cardTopRow}>
                          <Text style={styles.cardTitle}>{d.invoice_number}</Text>
                          <View style={[styles.badge, { backgroundColor: C.greenL }]}>
                            <Text style={[styles.badgeTxt, { color: '#145A32' }]}>Delivery</Text>
                          </View>
                        </View>
                        {d.company_name ? <Text style={styles.cardDetail}>Company: {d.company_name}</Text> : null}
                        <Text style={styles.cardDetail}>To: {d.delivered_person}  ·  {pmLabel(d.payment_method)}</Text>
                        {d.lat && d.lng && (
                          <TouchableOpacity style={styles.mapBtn}
                            onPress={() => Linking.openURL(`https://www.google.com/maps?q=${d.lat},${d.lng}&label=${d.invoice_number}`)}>
                            <Text style={styles.mapBtnTxt}>📍 View delivery location</Text>
                          </TouchableOpacity>
                        )}
                        <Text style={styles.cardTime}>{formatDate(d.created_at)}</Text>
                      </View>
                    ))}
                    <View style={{ height: 12 }} />
                  </ScrollView>

                  <TouchableOpacity style={[styles.submitBtn, { backgroundColor: C.destroy, marginTop: 10 }]}
                    onPress={() => handleDeleteSalesman(selectedSalesman)}>
                    <Text style={styles.submitTxt}>Delete Salesman Account</Text>
                  </TouchableOpacity>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* ── Admin Direct Mark Paid Modal ── */}
      <Modal visible={adminPayModal} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Mark as Paid</Text>
            <Text style={{ fontSize: 13, color: C.t2, textAlign: 'center', marginBottom: 12 }}>
              {adminPayInv?.invoice_number} · Admin override
            </Text>
            <Text style={styles.label}>Payment Method <Text style={styles.req}>*</Text></Text>
            <AdminPayTypeSelector
              type={adminPayType} setType={setAdminPayType}
              cashT={adminCashType} setCashT={setAdminCashType} />
            <View style={styles.infoBox}>
              <Text style={styles.infoTxt}>This will immediately move the invoice to Paid without salesman action.</Text>
            </View>
            <TouchableOpacity style={[styles.submitBtn, { marginTop: 14 }]} onPress={handleAdminMarkPaid}>
              <Text style={styles.submitTxt}>Confirm & Move to Paid</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setAdminPayModal(false)}>
              <Text style={styles.cancelTxt}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F5F7' },
  header: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    paddingTop: Platform.OS === 'ios' ? 58 : 42,
    paddingBottom: 18, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: '#EBEBEB',
  },
  title: { fontSize: 20, fontWeight: '800', color: '#1A252F' },
  subtitle: { fontSize: 12, color: '#5D6D7E', marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  notifWrap: { position: 'relative', padding: 4 },
  notifIcon: { fontSize: 22 },
  notifBadge: {
    position: 'absolute', top: 0, right: 0,
    backgroundColor: '#C0392B', borderRadius: 8, minWidth: 16, height: 16,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#FFFFFF',
  },
  notifBadgeTxt: { color: '#fff', fontSize: 9, fontWeight: '800' },
  logoutBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: '#DDD' },
  logoutTxt: { fontSize: 12, fontWeight: '700', color: '#EA4335' },
  statsRow: { flexDirection: 'row', gap: 8, padding: 14, paddingTop: 16, paddingBottom: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#EBEBEB' },
  statCard: { flex: 1, backgroundColor: '#F4F5F7', borderRadius: 12, padding: 12, alignItems: 'center', borderTopWidth: 3 },
  statVal: { fontSize: 22, fontWeight: '800' },
  statLbl: { fontSize: 9, fontWeight: '700', color: '#5D6D7E', marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.5 },
  navScroll: { backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#EBEBEB', flexGrow: 0 },
  navTab: { paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 2.5, borderBottomColor: 'transparent' },
  navTabOn: { borderBottomColor: '#C0392B' },
  navTabTxt: { fontSize: 12, fontWeight: '700', color: '#5D6D7E' },
  navTabTxtOn: { color: '#C0392B' },
  filterScroll: { paddingHorizontal: 14, paddingVertical: 10, flexGrow: 0 },
  filterPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#FFFFFF', marginRight: 8, borderWidth: 1, borderColor: '#DDD' },
  filterPillOn: { backgroundColor: '#C0392B', borderColor: '#C0392B' },
  filterPillTxt: { fontSize: 12, fontWeight: '600', color: '#5D6D7E' },
  filterPillTxtOn: { color: '#fff' },
  searchWrap: { paddingHorizontal: 14, paddingBottom: 6 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFFFF', borderRadius: 12, paddingHorizontal: 12, height: 42, borderWidth: 1, borderColor: '#E8EAED' },
  searchIcon: { fontSize: 14 },
  searchInput: { flex: 1, fontSize: 13, color: '#1A252F' },
  scroll: { flex: 1, paddingHorizontal: 14 },
  resultCount: { fontSize: 11, color: '#5D6D7E', marginBottom: 8, marginTop: 2 },
  addSalesBtn: { backgroundColor: '#C0392B', height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 14, marginTop: 60 },
  addSalesTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  salesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  salesCard: { width: '47.5%', backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, borderLeftWidth: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 10, elevation: 3 },
  salesCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  av: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
  trackDotWrap: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  trackDot: { width: 8, height: 8, borderRadius: 4 },
  salesName: { fontSize: 13, fontWeight: '700', color: '#1A252F' },
  salesSub: { fontSize: 11, color: '#5D6D7E', marginTop: 2 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 10, elevation: 3 },
  cardLeft: { borderLeftWidth: 4, paddingLeft: 14 },
  cardTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#1A252F', flex: 1 },
  cardDetail: { fontSize: 12, color: '#5D6D7E', marginTop: 2, lineHeight: 18 },
  cardTime: { fontSize: 10, color: '#AAB7C4', marginTop: 8 },
  salesBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, marginLeft: 8 },
  salesBadgeTxt: { fontSize: 10, fontWeight: '800' },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeTxt: { fontSize: 11, fontWeight: '700' },
  approveBtn: { backgroundColor: '#27AE60', padding: 10, borderRadius: 10, alignItems: 'center' },
  approveTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
  mapBtn: { backgroundColor: '#F4F5F7', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12, alignSelf: 'flex-start', marginTop: 8, borderWidth: 1, borderColor: '#DDD' },
  mapBtnTxt: { fontSize: 11, fontWeight: '700', color: '#C0392B' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.42)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 24 },
  sheetHandle: { width: 38, height: 4, backgroundColor: '#DDD', borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: '#C0392B', marginBottom: 16 },
  notifHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  closeBtn: { fontSize: 18, color: '#5D6D7E', fontWeight: '700', padding: 4 },
  notifItem: { padding: 12, borderRadius: 12, marginBottom: 8, backgroundColor: '#F9F9F9', borderLeftWidth: 3 },
  notifUnread: { backgroundColor: '#FFF5F5' },
  notifMsg: { fontSize: 13, fontWeight: '600', color: '#1A252F' },
  notifTime: { fontSize: 10, color: '#AAB7C4', marginTop: 4 },
  moreNotifs: { textAlign: 'center', color: '#5D6D7E', fontSize: 12, marginTop: 8, fontWeight: '600' },
  label: { fontSize: 12, fontWeight: '700', color: '#5D6D7E', marginBottom: 6, marginTop: 8 },
  req: { color: '#C0392B' },
  input: { height: 46, backgroundColor: '#F4F5F7', borderRadius: 12, paddingHorizontal: 14, fontSize: 14, color: '#1A252F', borderWidth: 1, borderColor: '#E8EAED' },
  infoBox: { backgroundColor: '#FFF8E1', borderRadius: 10, padding: 10, marginTop: 10 },
  infoTxt: { fontSize: 12, color: '#7D6608', lineHeight: 18 },
  submitBtn: { height: 50, backgroundColor: '#C0392B', borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  submitTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
  cancelBtn: { alignItems: 'center', marginTop: 12, paddingBottom: 4 },
  cancelTxt: { color: '#5D6D7E', fontSize: 14, fontWeight: '600' },
  detailHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  detailName: { fontSize: 16, fontWeight: '800', color: '#1A252F' },
  trackRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  trackTxt: { fontSize: 11, fontWeight: '700' },
  credBtn: { backgroundColor: '#EAF0FB', borderRadius: 10, padding: 11, alignItems: 'center', marginBottom: 10, borderWidth: 1, borderColor: '#D0E4F7' },
  credBtnTxt: { fontSize: 12, fontWeight: '700', color: '#2C3E50' },
  liveLocBtn: { backgroundColor: '#D5F5E3', borderRadius: 10, padding: 10, alignItems: 'center', marginBottom: 8, borderWidth: 1, borderColor: '#A9DFBF' },
  liveLocTxt: { fontSize: 12, fontWeight: '700', color: '#145A32' },
  sectionLabelSm: { fontSize: 10, fontWeight: '700', color: '#5D6D7E', letterSpacing: 0.8 },
  targetBox: { backgroundColor: '#F4F5F7', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#EBEBEB' },
  targetAchieved: { fontSize: 22, fontWeight: '800', color: '#2C3E50' },
  targetSlash: { fontSize: 13, fontWeight: '600', color: '#5D6D7E', marginBottom: 2 },
  targetBarBg: { height: 8, backgroundColor: '#E8EAED', borderRadius: 4, marginTop: 10, overflow: 'hidden' },
  targetBarFill: { height: 8, backgroundColor: '#27AE60', borderRadius: 4 },
  targetSaveBtn: { backgroundColor: '#C0392B', borderRadius: 10, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  targetSaveTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
  summaryRow: { marginBottom: 12, gap: 3 },
  summaryTxt: { fontSize: 11.5, color: '#5D6D7E', fontWeight: '600' },
  payRow: { flexDirection: 'row', gap: 8 },
  empty: { textAlign: 'center', color: '#AAB7C4', marginTop: 40, fontSize: 14 },
});
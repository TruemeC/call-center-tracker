import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot, collection, query, serverTimestamp } from 'firebase/firestore';
import { Users, Clock, Zap, Target, Loader2, RefreshCcw, Phone, Calendar, UserCheck, TrendingUp, Handshake } from 'lucide-react';

// --- Firebase and Configuration Setup ---
// Global variables provided by the Canvas environment
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// ****** VITAL: UPDATE THIS URL AFTER DEPLOYING YOUR GOOGLE APPS SCRIPT WEBHOOK ******
const GOOGLE_SHEET_WEBHOOK_URL = '[https://script.google.com/macros/s/YOUR_APPS_SCRIPT_ID/exec](https://script.google.com/macros/s/YOUR_APPS_SCRIPT_ID/exec)'; // REPLACE ME

// Hardcoded Targets (تحديث الأهداف بناءً على الصورة)
const TARGETS = {
  CALLS_DAILY: 140,
  CALLS_WEEKLY: 840,
  CALLS_MONTHLY: 3640,
  BOOKINGS_DAILY: 21,
  BOOKINGS_WEEKLY: 126,
  BOOKINGS_MONTHLY: 546,
  ATTENDANCE_DAILY: 11, // الحضور الفعلي
  ATTENDANCE_WEEKLY: 66,
  ATTENDANCE_MONTHLY: 273,
  // نسبة التحويل 25% تُحسب الآن من الداتا التسويقية، وليس من المكالمات
  CONV_RATE_TARGET: 0.25, // 25% (Bookings to Leads)
  ATTENDANCE_RATE_TARGET: 0.50, // 50% (Bookings to Attendance)
};

// Color Thresholds (تحديث نسب الإنجاز بناءً على الصورة)
const THRESHOLDS = {
  GREEN: 1.00, // 100% فأكثر (ممتاز)
  YELLOW: 0.70, // 70% إلى أقل من 100% (متوسط)
  RED: 0.00, // أقل من 70% (ضعيف)
};

// Encouragement Phrases
const ENCOURAGEMENT_PHRASES = {
  GREEN: ["عمل رائع! استمر في تحقيق الأهداف وأكثر.", "أداء ممتاز يفوق التوقعات، أنت نجم حقيقي!"],
  YELLOW: ["أداء جيد! على بُعد خطوات من الهدف، يمكنك فعلها.", "استمر في التقدم، القليل من الجهد الإضافي يُحدث فرقاً كبيراً."],
  RED: ["ابدأ بقوة اليوم! الأهداف في متناول يدك.", "كل يوم هو بداية جديدة، ركز لتحقيق التارقت!"],
};

// --- Employee Names List ---
const EMPLOYEE_NAMES = ['بيان', 'سلمى', 'سحر'];

// --- Helper Functions ---

/**
 * Calculates the performance status and encouragement phrase based on new thresholds.
 * @param {number} actual The actual achieved metric.
 * @param {number} target The target metric.
 * @returns {{color: string, status: string, englishStatus: string, phrase: string, ratio: number}}
 */
const getStatus = (actual, target) => {
  if (target === 0 || isNaN(target)) {
    return { 
        color: 'text-gray-500 bg-gray-100', 
        status: 'لا يوجد هدف', 
        englishStatus: 'No Target',
        phrase: 'ننتظر تحديد الأهداف.', 
        ratio: 0 
    };
  }
  const ratio = actual / target;
  let color, status, englishStatus, phrases;

  if (ratio >= THRESHOLDS.GREEN) {
    color = 'text-green-500 bg-green-100';
    status = 'ممتاز';
    englishStatus = 'Excellent';
    phrases = ENCOURAGEMENT_PHRASES.GREEN;
  } else if (ratio >= THRESHOLDS.YELLOW) { // 70% to < 100%
    color = 'text-yellow-500 bg-yellow-100';
    status = 'متوسط';
    englishStatus = 'Average';
    phrases = ENCOURAGEMENT_PHRASES.YELLOW;
  } else { // Less than 70%
    color = 'text-red-500 bg-red-100';
    status = 'ضعيف';
    englishStatus = 'Poor';
    phrases = ENCOURAGEMENT_PHRASES.RED;
  }

  const phrase = phrases[Math.floor(Math.random() * phrases.length)];
  return { color, status, englishStatus, phrase, ratio: ratio * 100 };
};

// --- Performance Indicator Component ---

const PerformanceIndicator = ({ title, metric, target, Icon, unit = '' }) => {
  const { color, status, ratio } = getStatus(metric, target);
  const strokeColor = color.match(/text-([a-z]+)-(\d+)/)?.[0].replace('text', 'border') || 'border-gray-400';

  const percentage = ratio ? Math.min(100, Math.round(ratio)) : 0;
  const circumference = 2 * Math.PI * 50;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-col items-center p-4 bg-white rounded-xl shadow-lg transition-all duration-300 hover:shadow-xl border border-gray-100">
      <div className="relative h-28 w-28">
        <svg className="w-full h-full transform -rotate-90">
          <circle
            className="text-gray-200"
            strokeWidth="10"
            stroke="currentColor"
            fill="transparent"
            r="50"
            cx="60"
            cy="60"
          />
          <circle
            className={strokeColor.replace('border', 'text')}
            strokeWidth="10"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            stroke="currentColor"
            fill="transparent"
            r="50"
            cx="60"
            cy="60"
          />
        </svg>
        <div className="absolute top-0 right-0 left-0 bottom-0 flex flex-col items-center justify-center">
          <Icon className={`w-6 h-6 ${color.split(' ')[0]}`} />
          <span className={`text-lg font-bold ${color.split(' ')[0]} mt-1`}>
            {percentage}%
          </span>
        </div>
      </div>
      <h3 className="text-xl font-extrabold text-gray-800 mt-3">{title}</h3>
      <p className={`text-sm font-semibold ${color.split(' ')[0]}`}>{status}</p>
      <p className="text-xs text-gray-500 mt-1">
        الإنجاز: {metric.toLocaleString()} {unit} / {target.toLocaleString()} {unit}
      </p>
    </div>
  );
};

// --- Rate Indicator Component (For Conversion/Attendance Rates) ---

const RateIndicator = ({ title, metric, target, Icon }) => {
    const displayMetric = (metric * 100).toFixed(1);
    const displayTarget = (target * 100).toFixed(0);
    const { color, status } = getStatus(metric, target);

    return (
        <div className="p-4 bg-white rounded-xl shadow-lg border border-gray-100 flex items-center justify-between transition duration-300 hover:shadow-xl">
            <div className="flex items-center">
                <div className={`p-3 rounded-full ${color.split(' ')[1]} ml-3`}>
                    <Icon className={`w-5 h-5 ${color.split(' ')[0]}`} />
                </div>
                <div>
                    <h3 className="text-md font-semibold text-gray-700">{title}</h3>
                    <p className="text-sm text-gray-500">الهدف: {displayTarget}%</p>
                </div>
            </div>
            <div className="text-center">
                <p className={`text-xl font-bold ${color.split(' ')[0]}`}>{displayMetric}%</p>
                <p className={`text-xs font-semibold ${color.split(' ')[0]}`}>{status}</p>
            </div>
        </div>
    );
};


// --- Main Application Component ---

const App = () => {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [userName, setUserName] = useState(EMPLOYEE_NAMES[0]); // Default to bayan
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [dailyCalls, setDailyCalls] = useState(''); // Input 1: Calls
  const [dailyBookings, setDailyBookings] = useState(''); // Input 2: Bookings
  const [dailyAttendance, setDailyAttendance] = useState(''); // Input 3: Attendance
  const [dailyLeads, setDailyLeads] = useState('50'); // NEW Input 4: Leads, default 50
  const [employees, setEmployees] = useState({});
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState('');
  
  // Get Today's date formatted in Arabic (Gregorian Calendar)
  const todayDate = useMemo(() => {
    return new Date().toLocaleString('ar-SA', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        calendar: 'gregory'
    });
  }, []);

  // 1. Firebase Initialization and Authentication
  useEffect(() => {
    let app, firestore, authInstance;
    try {
      app = initializeApp(firebaseConfig);
      firestore = getFirestore(app);
      authInstance = getAuth(app);
      setDb(firestore);
      setAuth(authInstance);

      const unsubscribe = onAuthStateChanged(authInstance, async (user) => {
        if (user) {
          setUserId(user.uid);
          // Load selected name from storage or default
          let currentUserName = localStorage.getItem('selectedEmployeeName') || EMPLOYEE_NAMES[0];
          setUserName(currentUserName);
          setIsAuthReady(true);
        } else {
          try {
            if (initialAuthToken) {
              await signInWithCustomToken(authInstance, initialAuthToken);
            } else {
              await signInAnonymously(authInstance);
            }
          } catch (error) {
            console.error("Firebase Auth Error:", error);
            setIsAuthReady(true);
          }
        }
        setLoading(false);
      });

      return () => unsubscribe();
    } catch (e) {
      console.error("Failed to initialize Firebase:", e);
      setStatusMessage("فشل في تهيئة قاعدة البيانات. تحقق من الإعدادات.");
      setLoading(false);
    }
  }, []);

  // 2. Firestore Data Listener
  useEffect(() => {
    if (!db || !isAuthReady) return;

    const collectionPath = `artifacts/${appId}/public/data/callCenterPerformance`;
    const q = query(collection(db, collectionPath));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newEmployees = {};
      snapshot.forEach((doc) => {
        newEmployees[doc.id] = { id: doc.id, ...doc.data() };
      });
      setEmployees(newEmployees);
    }, (error) => {
      console.error("Firestore snapshot error:", error);
      setStatusMessage("خطأ في جلب بيانات الأداء.");
    });

    return () => unsubscribe();
  }, [db, isAuthReady]);


  // Calculate Weekly/Monthly Performance (Mock Accumulation Logic)
  const calculateAggregatePerformance = useCallback((calls, bookings, attendance, currentPerformance = {}) => {
    const today = new Date();
    const currentMonth = today.getMonth();
    const lastUpdateDate = currentPerformance.lastUpdate ? new Date(currentPerformance.lastUpdate.seconds * 1000) : null;
    
    // --- Determine if Reset is needed ---
    let shouldResetMonthly = false;
    let shouldResetWeekly = false;

    if (lastUpdateDate) {
        const lastUpdateMonth = lastUpdateDate.getMonth();
        // Check for Month Reset (إذا كان الشهر الحالي يختلف عن الشهر الأخير للتحديث)
        if (currentMonth !== lastUpdateMonth) {
            shouldResetMonthly = true;
            shouldResetWeekly = true; // يتم تصفير الأسبوعي عند تصفير الشهري
        } else {
            // Check for Week Reset (إذا لم يتغير الشهر، نتحقق من تصفير الأسبوع)
            const lastUpdateDayOfWeek = lastUpdateDate.getDay(); // 0 = Sunday, 6 = Saturday
            const todayDayOfWeek = today.getDay(); 
            // يتم التصفير الأسبوعي إذا كان اليوم هو الأحد (0) ولم يكن آخر تحديث في نفس الأسبوع
            if (todayDayOfWeek === 0 && lastUpdateDayOfWeek !== 0) {
                shouldResetWeekly = true;
            }
        }
    }
    
    // --- Apply Accumulation/Reset Logic ---
    let newCallsWeekly = currentPerformance.callsWeekly || 0;
    let newCallsMonthly = currentPerformance.callsMonthly || 0;
    let newBookingsWeekly = currentPerformance.bookingsWeekly || 0;
    let newBookingsMonthly = currentPerformance.bookingsMonthly || 0;
    let newAttendanceWeekly = currentPerformance.attendanceWeekly || 0;
    let newAttendanceMonthly = currentPerformance.attendanceMonthly || 0;

    // Reset Monthly Counters
    if (shouldResetMonthly) {
        console.log("Monthly Reset Triggered for", currentPerformance.name);
        newCallsMonthly = 0;
        newBookingsMonthly = 0;
        newAttendanceMonthly = 0;
    }

    // Reset Weekly Counters
    if (shouldResetWeekly) {
        console.log("Weekly Reset Triggered for", currentPerformance.name);
        newCallsWeekly = 0;
        newBookingsMonthly = 0;
        newAttendanceWeekly = 0;
    }
    
    // Accumulate Daily Inputs
    newCallsWeekly += calls; // أزلنا القيمة العشوائية لنجعلها أكثر واقعية
    newCallsMonthly += calls; // أزلنا القيمة العشوائية لنجعلها أكثر واقعية
    newBookingsWeekly += bookings; // أزلنا القيمة العشوائية
    newBookingsMonthly += bookings; // أزلنا القيمة العشوائية
    newAttendanceWeekly += attendance; // أزلنا القيمة العشوائية
    newAttendanceMonthly += attendance; // أزلنا القيمة العشوائية

    return {
      callsDaily: calls,
      callsWeekly: newCallsWeekly,
      callsMonthly: newCallsMonthly,
      bookingsDaily: bookings,
      bookingsWeekly: newBookingsWeekly,
      bookingsMonthly: newBookingsMonthly,
      attendanceDaily: attendance, // Use direct input
      attendanceWeekly: newAttendanceWeekly,
      attendanceMonthly: newAttendanceMonthly,
      shouldArchive: shouldResetMonthly ? true : false, // إرسال إشارة للـ Webhook
      lastUpdate: today.toISOString() // سيتم الكتابة عليه بـ serverTimestamp() لاحقاً، هذا فقط للإشارة
    };
  }, []);
  
  /**
   * Sends daily performance data to the Google Apps Script Webhook.
   * @param {object} data - The data object containing daily performance metrics.
   */
  const sendToGoogleSheet = async (data) => {
      if (GOOGLE_SHEET_WEBHOOK_URL.includes('YOUR_APPS_SCRIPT_ID')) {
          console.warn("Skipping Google Sheet export: GOOGLE_SHEET_WEBHOOK_URL is not configured.");
          return;
      }
      
      const payload = {
          action: 'insertData',
          ...data,
          timestamp: new Date().toISOString(),
      };
      
      try {
          const response = await fetch(GOOGLE_SHEET_WEBHOOK_URL, {
              method: 'POST',
              mode: 'no-cors', // Essential for Google Apps Script Webhooks
              cache: 'no-cache',
              headers: {
                  'Content-Type': 'application/json',
              },
              body: JSON.stringify(payload),
          });

          // Since we use 'no-cors', we cannot check response.ok, but we can log success attempt
          console.log("Attempted to send data to Google Sheet Webhook.");

      } catch (error) {
          console.error("Error sending data to Google Sheet:", error);
      }
  };

  // 3. Handle Performance Submission
  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!db || !userId || !userName) {
      setStatusMessage("الرجاء تحديد الاسم وتسجيل الدخول أولاً.");
      return;
    }

    // --- Read values as 0 if empty string or parse to integer ---
    const callsValue = parseInt(dailyCalls || '0', 10);
    const bookingsValue = parseInt(dailyBookings || '0', 10);
    const attendanceValue = parseInt(dailyAttendance || '0', 10);
    const leadsValue = parseInt(dailyLeads || '0', 10); 

    // --- LOGGING FOR DEBUGGING ---
    console.log(`[DEBUG] Attempting to submit for ${userName}. Calls: ${callsValue}, Attendance: ${attendanceValue}`);

    // --- Validation (Ensures no negative values or non-numbers) ---
    if (callsValue < 0 || bookingsValue < 0 || attendanceValue < 0 || leadsValue < 0) {
      setStatusMessage("يرجى إدخال أرقام صحيحة وموجبة لجميع الحقول.");
      return;
    }
    
    // The key in the 'employees' state is now the userName, not the userId
    const currentPerformance = employees[userName] || {}; 
    // Pass attendanceValue and check for resets
    const calculatedData = calculateAggregatePerformance(callsValue, bookingsValue, attendanceValue, currentPerformance);
    
    // --- تعديل حساب نسبة التحويل ---
    // نسبة التحويل = الحجوزات / الداتا التسويقية اليومية (Leads Value)
    const convRate = leadsValue > 0 ? bookingsValue / leadsValue : 0;
    
    // Calculate Attendance Rate (Bookings to Actual Attendance)
    const attendanceRate = bookingsValue > 0 ? attendanceValue / bookingsValue : 0; 

    const dailyDataToSave = {
        name: userName, 
        // Daily Inputs and Calculated Rates - UNIFIED KEYS
        callsDaily: callsValue, 
        dailyBookings: bookingsValue,
        attendanceDaily: attendanceValue, 
        dailyLeads: leadsValue, 
        convRate: convRate, 
        attendanceRate: attendanceRate, 
        // All Aggregated Metrics
        callsWeekly: calculatedData.callsWeekly, 
        callsMonthly: calculatedData.callsMonthly,
        bookingsWeekly: calculatedData.bookingsWeekly,
        bookingsMonthly: calculatedData.bookingsMonthly,
        attendanceWeekly: calculatedData.attendanceWeekly,
        attendanceMonthly: calculatedData.attendanceMonthly,
        
        lastUpdate: serverTimestamp(), // حفظ الوقت بالخادم لضمان الدقة
    };

    try {
      // 1. Save to Firestore (for real-time dashboard)
      const docRef = doc(db, `artifacts/${appId}/public/data/callCenterPerformance`, userName);
      await setDoc(docRef, dailyDataToSave, { merge: true });

      // 2. Send to Google Sheet (for daily report archiving)
      const sheetData = {
          action: calculatedData.shouldArchive ? 'archiveAndInsert' : 'insertData', // إرسال الإشارة للأرشفة
          employeeName: userName,
          calls: callsValue, 
          bookings: bookingsValue, 
          attendance: attendanceValue, 
          leads: leadsValue, 
          conversionRate: (convRate * 100).toFixed(2) + '%',
          attendanceRate: (attendanceRate * 100).toFixed(2) + '%',
          dailyStatus: getStatus(callsValue, TARGETS.CALLS_DAILY).status, 
      };
      await sendToGoogleSheet(sheetData);

      setStatusMessage(`تم تسجيل أداء اليوم بنجاح لـ ${userName}. وتم إرسال التقرير اليومي.`);
      // Clear inputs
      setDailyCalls('');
      setDailyBookings('');
      setDailyAttendance(''); 
      setDailyLeads('50'); 
    } catch (error) {
      console.error("Error submitting performance:", error);
      setStatusMessage(`فشل في حفظ البيانات: ${error.message}`);
    }
  }, [db, userId, userName, dailyCalls, dailyBookings, dailyAttendance, dailyLeads, calculateAggregatePerformance, employees]);
  

  // Handle name selection from the dropdown
  const handleNameChange = (e) => {
    const newName = e.target.value;
    setUserName(newName);
    localStorage.setItem('selectedEmployeeName', newName); // Persist name selection
  };

  // *** تعديل: استخدام userName كمعرّف لاسترداد بيانات الموظفة الحالية ***
  const currentEmployeeData = employees[userName] || {};
  const lastUpdateTimestamp = currentEmployeeData.lastUpdate ? new Date(currentEmployeeData.lastUpdate.seconds * 1000).toLocaleString('ar-SA', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', calendar: 'gregory' }) : 'لا يوجد سجل سابق';

  // Calculate status for the primary metric (Calls) for the main circles
  const dailyStatus = useMemo(() => getStatus(currentEmployeeData.callsDaily || 0, TARGETS.CALLS_DAILY), [currentEmployeeData.callsDaily]);
  const weeklyStatus = useMemo(() => getStatus(currentEmployeeData.callsWeekly || 0, TARGETS.CALLS_WEEKLY), [currentEmployeeData.callsWeekly]);
  const monthlyStatus = useMemo(() => getStatus(currentEmployeeData.callsMonthly || 0, TARGETS.CALLS_MONTHLY), [currentEmployeeData.callsMonthly]);
  
  // Calculate status for rates
  const conversionRateStatus = useMemo(() => getStatus(currentEmployeeData.convRate || 0, TARGETS.CONV_RATE_TARGET), [currentEmployeeData.convRate]);
  const attendanceRateStatus = useMemo(() => getStatus(currentEmployeeData.attendanceRate || 0, TARGETS.ATTENDANCE_RATE_TARGET), [currentEmployeeData.attendanceRate]);


  // Determine the overall status color for the encouragement banner
  const overallStatusColor = dailyStatus.color.split(' ')[0];
  const overallPhrase = dailyStatus.phrase;

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-50">
        <Loader2 className="animate-spin w-8 h-8 text-indigo-600" />
        <span className="mr-3 text-lg font-medium text-indigo-600">جارٍ التحميل...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8 font-sans" dir="rtl">
      <div className="max-w-7xl mx-auto">
        
        <header className="flex flex-col sm:flex-row justify-between items-start mb-4 pb-2 border-b">
            <div className="mb-4 sm:mb-0">
                <h1 className="text-3xl font-extrabold text-indigo-700 flex items-center">
                    <Zap className="w-8 h-8 ml-3 text-indigo-500" /> لوحة تحكم أداء الكول سنتر
                </h1>
                {/* NEW: Display Today's Date and Day */}
                <p className="mt-1 text-base font-semibold text-gray-600 flex items-center">
                    <Calendar className="w-4 h-4 ml-2 text-indigo-500" />
                    {todayDate}
                </p>
            </div>
            
            {userId && (
                <div className="text-sm text-gray-600 mt-2 sm:mt-0 sm:text-right">
                    <span className="font-semibold block">رمز المستخدم:</span>{' '}
                    <span className="font-mono bg-indigo-50 px-2 py-1 rounded-md text-indigo-800 text-xs">
                        {userId}
                    </span>
                </div>
            )}
        </header>

        {/* Current Employee Dashboard */}
        <section className="mb-10 p-6 bg-white rounded-2xl shadow-xl border border-indigo-100">
          <div className="flex items-center justify-between mb-6 border-b pb-4">
            <h2 className="text-2xl font-bold text-gray-800">
              مؤشر أدائي ({userName})
            </h2>
             {/* Name Selector */}
            <select
                value={userName}
                onChange={handleNameChange}
                className="px-3 py-1 border border-gray-300 rounded-lg text-sm text-center shadow-sm w-32 sm:w-48 transition duration-150 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
            >
                {EMPLOYEE_NAMES.map(name => (
                    <option key={name} value={name}>{name}</option>
                ))}
            </select>
          </div>
            <p className="text-sm text-gray-500 mb-4">
                آخر تحديث: <span className="font-semibold text-gray-700">{lastUpdateTimestamp}</span>
            </p>

          {/* Encouragement Banner */}
          <div className={`p-4 mb-6 rounded-xl ${overallStatusColor.replace('text', 'bg').replace('500', '100')} flex items-start shadow-md`}>
            <Zap className={`w-6 h-6 ml-3 ${overallStatusColor}`} />
            <p className={`font-semibold ${overallStatusColor}`}>{overallPhrase}</p>
          </div>


          {/* Performance Indicators (Focusing on Calls KPI) */}
          <h3 className="text-xl font-bold text-gray-700 mb-4">أداء المكالمات (الـ KPI الرئيسي)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
            <PerformanceIndicator title="يومي" metric={currentEmployeeData.callsDaily || 0} target={TARGETS.CALLS_DAILY} Icon={Phone} unit="اتصال" />
            <PerformanceIndicator title="أسبوعي" metric={currentEmployeeData.callsWeekly || 0} target={TARGETS.CALLS_WEEKLY} Icon={RefreshCcw} unit="اتصال" />
            <PerformanceIndicator title="شهري" metric={currentEmployeeData.callsMonthly || 0} target={TARGETS.CALLS_MONTHLY} Icon={Target} unit="اتصال" />
          </div>

          {/* Rate Metrics Section */}
          <h3 className="text-xl font-bold text-gray-700 mb-4 mt-8 pt-4 border-t">معدلات الأداء (النسب المئوية)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
            <RateIndicator 
                title={`نسبة التحويل (حجوزات لكل داتا تسويقية)`} 
                metric={currentEmployeeData.convRate || 0} 
                target={TARGETS.CONV_RATE_TARGET} 
                Icon={TrendingUp} 
            />
            <RateIndicator 
                title="نسبة الحضور (حجوزات إلى حضور فعلي)" 
                metric={currentEmployeeData.attendanceRate || 0} 
                target={TARGETS.ATTENDANCE_RATE_TARGET} 
                Icon={UserCheck} 
            />
          </div>


          {/* Performance Input Form */}
          <form onSubmit={handleSubmit} className="p-6 border border-dashed border-gray-300 rounded-xl bg-gray-50">
            <h3 className="text-xl font-bold text-gray-700 mb-4">إدخال أداء اليوم</h3>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
              
              {/* Calls Input */}
              <div className="w-full">
                <label htmlFor="dailyCalls" className="block text-sm font-medium text-gray-700 mb-1">
                  1. عدد المكالمات المُنجزة (هدف: {TARGETS.CALLS_DAILY})
                </label>
                <input
                  type="number"
                  id="dailyCalls"
                  value={dailyCalls}
                  onChange={(e) => setDailyCalls(e.target.value)}
                  placeholder="140 اتصال"
                  min="0"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm text-lg focus:ring-indigo-500 focus:border-indigo-500 text-right"
                  
                />
              </div>

              {/* Bookings Input */}
              <div className="w-full">
                <label htmlFor="dailyBookings" className="block text-sm font-medium text-gray-700 mb-1">
                  2. عدد الحجوزات المؤكدة (هدف: {TARGETS.BOOKINGS_DAILY})
                </label>
                <input
                  type="number"
                  id="dailyBookings"
                  value={dailyBookings}
                  onChange={(e) => setDailyBookings(e.target.value)}
                  placeholder="21 حجز"
                  min="0"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm text-lg focus:ring-indigo-500 focus:border-indigo-500 text-right"
                  
                />
              </div>
              
              {/* Attendance Input */}
              <div className="w-full">
                <label htmlFor="dailyAttendance" className="block text-sm font-medium text-gray-700 mb-1">
                  3. عدد الحضور الفعلي (هدف: {TARGETS.ATTENDANCE_DAILY})
                </label>
                <input
                  type="number"
                  id="dailyAttendance"
                  value={dailyAttendance}
                  onChange={(e) => setDailyAttendance(e.target.value)}
                  placeholder="11 عميل"
                  min="0"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm text-lg focus:ring-indigo-500 focus:border-indigo-500 text-right"
                  
                />
              </div>

              {/* Leads Input (New Field) */}
              <div className="w-full">
                <label htmlFor="dailyLeads" className="block text-sm font-medium text-gray-700 mb-1">
                  4. عدد الداتا التسويقية (Leads)
                </label>
                <input
                  type="number"
                  id="dailyLeads"
                  value={dailyLeads}
                  onChange={(e) => setDailyLeads(e.target.value)}
                  placeholder="50 رقم"
                  min="0"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm text-lg focus:ring-indigo-500 focus:border-indigo-500 text-right"
                  
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                className="w-full h-11 px-6 py-2 text-lg font-semibold text-white bg-indigo-600 rounded-lg shadow-lg hover:bg-indigo-700 transition duration-150 transform hover:scale-[1.02] mt-4 md:mt-0"
                disabled={!isAuthReady}
              >
                تسجيل الأداء
              </button>
            </div>
          </form>

          {/* Status Message */}
          {statusMessage && (
            <p className="mt-4 text-center text-sm font-medium text-indigo-600">{statusMessage}</p>
          )}

        </section>

        {/* All Employees Tracking Section */}
        <section className="mt-10 p-6 bg-white rounded-2xl shadow-xl border border-indigo-100">
          <h2 className="text-2xl font-bold text-gray-800 flex items-center mb-6 border-b pb-4">
            <Users className="w-6 h-6 ml-2 text-indigo-500" />
            تتبع أداء جميع الموظفين (ملخص يومي للمؤشرات الرئيسية)
          </h2>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">الاسم / Name</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">المكالمات (هدف: {TARGETS.CALLS_DAILY}) / Calls</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">الحجوزات (هدف: {TARGETS.BOOKINGS_DAILY}) / Bookings</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">الحضور الفعلي (هدف: {TARGETS.ATTENDANCE_DAILY}) / Attendance</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">نسبة التحويل (هدف: 25%) / Conv. Rate</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {/* تعديل: استخدام keys() للعرض لأن keys هي الأسماء */}
                {Object.keys(employees).map(employeeKey => {
                  const employee = employees[employeeKey];
                  const isCurrentUser = employee.name === userName; // الآن نتحقق من تطابق الاسم

                  const callsStatus = getStatus(employee.callsDaily || 0, TARGETS.CALLS_DAILY);
                  const bookingsStatus = getStatus(employee.dailyBookings || 0, TARGETS.BOOKINGS_DAILY);
                  const attendanceStatus = getStatus(employee.attendanceDaily || 0, TARGETS.ATTENDANCE_DAILY);
                  const convStatus = getStatus(employee.convRate || 0, TARGETS.CONV_RATE_TARGET);

                  const renderCell = (value, status) => (
                    <div className={`px-2 py-1 rounded-lg text-sm font-semibold text-center ${status.color.split(' ')[1]}`}>
                      {value}
                      <span className={`text-xs block ${status.color.split(' ')[0]}`}>{status.englishStatus}</span>
                    </div>
                  );
                  
                  return (
                    <tr key={employeeKey} className={isCurrentUser ? 'bg-indigo-50' : 'hover:bg-gray-50'}>
                      <td className="px-3 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {employee.name} {isCurrentUser && <span className="text-indigo-600 font-bold text-xs">(Current)</span>}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm">
                        {renderCell(employee.callsDaily || 0, callsStatus)}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm">
                        {renderCell(employee.dailyBookings || 0, bookingsStatus)}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm">
                         {renderCell(employee.attendanceDaily || 0, attendanceStatus)}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm">
                        {renderCell(((employee.convRate || 0) * 100).toFixed(1) + '%', convStatus)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {Object.keys(employees).length === 0 && (
            <p className="text-center text-gray-500 py-4">لا يوجد بيانات للموظفين بعد. ابدأ بإدخال بياناتك!</p>
          )}
        </section>

      </div>
    </div>
  );
};

export default App;

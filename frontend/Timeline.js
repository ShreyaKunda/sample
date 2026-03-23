import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import moment from 'moment';
import ReactECharts from 'echarts-for-react';

const TimelinePage = () => {
    const { tailNumber } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const dataCache = useRef({});

    // State management
    const [rawTimelineData, setRawTimelineData] = useState([]);
    const [selectedFlight, setSelectedFlight] = useState('');
    const [selectedModule, setSelectedModule] = useState([]);
    const [modules, setModules] = useState([]);
    const [flights, setFlights] = useState([]);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [loading, setLoading] = useState(true);
    const [startTime, setStartTime] = useState('00:00');
    const [endTime, setEndTime] = useState('23:59');
    const [availableDates, setAvailableDates] = useState([]);
    const [showClusterDetails, setShowClusterDetails] = useState(false);
    const [selectedEvent, setSelectedEvent] = useState(null);
    
    // Event type selection state
    const [eventTypeFilter, setEventTypeFilter] = useState({
        normal: false,
        faults: false,
    });

    const chartRef = useRef(null);

    // Parse URL parameters
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const flightFilter = params.get('power_on_counter') || '';
        const start = params.get('startDate') || '';
        const end = params.get('endDate') || '';
        setSelectedFlight(flightFilter);
        setStartDate(start);
        setEndDate(end);
    }, [location]);

    // Fetch timeline data
    useEffect(() => {
        const cacheKey = `timeline_${tailNumber}`;
        
        // Return cached data if available
        if (dataCache.current[cacheKey]) {
            const cached = dataCache.current[cacheKey];
            setRawTimelineData(cached);
            setLoading(false);
            return;
        }

        const apiUrl = tailNumber === 'All Aircrafts'
            ? `http://localhost:5000/timeline/all`
            : `http://localhost:5000/timeline/${tailNumber}`;

        setLoading(true);

        axios.get(apiUrl)
            .then((response) => {
                if (!response.data || !response.data.timeline) return;

                const timelineItems = response.data.timeline.map((event, index) => ({
                    id: index + 1,
                    start: moment(event.start, 'YYYY-MM-DD HH:mm:ss').toDate(),
                    content: event.content,
                    group: event.group,
                    module: event.module,
                    tooltip: event.tooltip,
                    style: event.style,
                    isFault: event.style.includes('red'),
                }));

                dataCache.current[cacheKey] = timelineItems;
                setRawTimelineData(timelineItems);

                const allDates = timelineItems.map(item => moment(item.start));
                const uniqueDates = [...new Set(allDates.map(d => d.format('YYYY-MM-DD')))].sort();
                setAvailableDates(uniqueDates);

                const sortedFlights = [...new Set(timelineItems.map(item => item.group))]
                    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
                setFlights(sortedFlights);
                const allModules = [...new Set(timelineItems.map(item => item.module))];
                setModules(allModules);
                setSelectedModule(allModules);
                setLoading(false);
            })
            .catch(error => {
                console.error('\u274c Error fetching timeline data:', error);
                setLoading(false);
            });
    }, [tailNumber]);

    // Use raw timeline data without clustering
    const timelineItems = useMemo(() => {
        return rawTimelineData;
    }, [rawTimelineData]);

    // Memoized filtered data
    const filteredData = useMemo(() => {
        if (!selectedFlight) return [];

        let filtered = timelineItems.filter(item => item.group === selectedFlight);

        if (selectedModule.length > 0) {
            filtered = filtered.filter(item => selectedModule.includes(item.module));
        }

        if (startDate && endDate && startTime && endTime) {
            const startDT = moment(`${startDate} ${startTime}`, 'YYYY-MM-DD HH:mm');
            const endDT = moment(`${endDate} ${endTime}`, 'YYYY-MM-DD HH:mm');
            filtered = filtered.filter(item => {
                const itemDate = moment(item.start);
                return itemDate.isBetween(startDT, endDT, null, '[]');
            });
        }

        // Event type filter logic
        if (eventTypeFilter.normal && eventTypeFilter.faults) {
            // Both normal and faults
        } else if (eventTypeFilter.normal) {
            filtered = filtered.filter(item => !item.isFault); // Only normal events
        } else if (eventTypeFilter.faults) {
            filtered = filtered.filter(item => item.isFault); // Only fault events
        }

        return filtered;
    }, [timelineItems, selectedFlight, selectedModule, startDate, endDate, startTime, endTime, eventTypeFilter]);

    // Update available modules when filters change
    useEffect(() => {
        let filteredForModules = [...timelineItems];
        if (selectedFlight) {
            filteredForModules = filteredForModules.filter(item => item.group === selectedFlight);
        }
        if (startDate && endDate && startTime && endTime) {
            const startDT = moment(`${startDate} ${startTime}`, 'YYYY-MM-DD HH:mm');
            const endDT = moment(`${endDate} ${endTime}`, 'YYYY-MM-DD HH:mm');
            filteredForModules = filteredForModules.filter(item => {
                const itemDate = moment(item.start);
                return itemDate.isBetween(startDT, endDT, null, '[]');
            });
        }
        const uniqueModules = [...new Set(filteredForModules.map(item => item.module))];
        setModules(uniqueModules);
        setSelectedModule(uniqueModules);
    }, [timelineItems, selectedFlight, startDate, endDate, startTime, endTime]);

    // Format time with 24hr and AM/PM
    const formatTimeDisplay = useCallback((date) => {
        const time = moment(date);
        const hour24 = time.format('HH:mm:ss');
        const ampm = time.format('A');
        return `${hour24} ${ampm}`;
    }, []);

    // Build vertical timeline chart - professional format
    const chartOption = useMemo(() => {
        if (!selectedFlight) {
            return {
                title: { text: 'Select a flight to load events', left: 'center', top: 'center' },
                series: [],
            };
        }

        if (filteredData.length === 0) {
            return {
                title: { text: 'No events found for the selected flight', left: 'center', top: 'center' },
                series: [],
            };
        }

        // Sort by time ascending (oldest first) for chronological timeline
        const sortedData = [...filteredData].sort((a, b) => a.start - b.start);

        const timeData = sortedData.slice().map((item, idx) => ({
            time: moment(item.start).format('HH:mm:ss'),
            timeAmPm: formatTimeDisplay(item.start),
            date: moment(item.start).format('YYYY-MM-DD'),
            fullDateTime: moment(item.start).format('YYYY-MM-DD HH:mm:ss A'),
            content: item.content,
            flight: item.group,
            module: item.module,
            tooltip: item.tooltip,
            isFault: item.isFault,
            isCluster: item.isCluster,
            clusterId: item.id,
            rawData: item,
        }));

        return {
            title: {
                text: 'Events Timeline',
                left: 'center',
                textStyle: {
                    fontSize: 18,
                    fontWeight: 'bold',
                    color: '#333',
                },
                top: '10px',
            },
            tooltip: {
                trigger: 'item',
                formatter: (params) => {
                    const idx = params.value[1]; // Changed from params.value[0] to params.value[1] for vertical
                    const item = timeData[idx];
                    if (!item) return '';
                    
                    const typeIcon = item.isFault ? 'FAULT' : item.isCluster ? 'CLUSTER' : 'EVENT';
                    const clusterInfo = item.isCluster ? `<br/><small style='color: #73706c;'>Multiple Events Grouped</small>` : '<br/><small> </small>';
                    
                    return `<div style='padding: 10px 12px; background: #fff; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); min-width: 280px;'>
                        <div style='font-weight: bold; color: #333; margin-bottom: 8px;'>
                            ${item.content}
                        </div>
                        <div style='color: ${item.isFault ? '#d32f2f' : '#1976d2'}; font-weight: bold; margin-bottom: 6px;'>
                            ${typeIcon}
                        </div>
                        <table style='font-size: 12px; width: 100%;'>
                            <tr><td style='color: #666;'>Date:</td><td style='color: #333; font-weight: 500;'>${item.date}</td></tr>
                            <tr><td style='color: #666;'>Time:</td><td style='color: #333; font-weight: 500;'>${item.timeAmPm}</td></tr>
                            <tr><td style='color: #666;'>Flight:</td><td style='color: #333; font-weight: 500;'>${item.flight}</td></tr>
                            <tr><td style='color: #666;'>Module:</td><td style='color: #333; font-weight: 500;'>${item.module}</td></tr>
                        </table>
                        <div style='margin-top: 8px; padding-top: 8px; border-top: 1px solid #eee; font-size: 11px; color: #666;'>
                            ${item.tooltip}
                        </div>
                        ${clusterInfo}
                    </div>`;
                },
                backgroundColor: 'transparent',
                borderColor: 'transparent',
                textStyle: { color: '#333' },
            },
            grid: {
                left: '250px', // Increased for vertical labels
                right: '10px',
                top: '80px',
                bottom: '100px',
                containLabel: false,
                backgroundColor: '#fafbfc',
                borderColor: '#73706c',
                borderWidth: 2,
            },
            xAxis: {
                type: 'value',
                splitLine: {
                    show: true,
                },
                splitArea: {
                    show: true, // Disabled split area
                },
                axisLabel: { show: false },
                axisLine: { show: true },
                axisTick: { show: false },
                min: 0,
                max: 1,
                show: false, // Hide the entire xAxis
            },
            yAxis: {
                type: 'category',
                data: timeData.map((item) => item.timeAmPm), // Remove numbering, just show time
                splitLine: {
                    show: false,
                },
                axisLabel: {
                    fontSize: 12,
                    color: '#333',
                    margin: 8,
                    fontWeight: '500',
                    interval: 0,
                    rotate: 0,
                    align: 'right',
                },
                axisLine: { show: true, lineStyle: { color: '#73706c', width: 0.5 } },
                axisTick: { show: false },
                inverse: true, // Keep normal order (oldest at top, newest at bottom)
            },
            dataZoom: [
                {
                    type: 'inside',
                    orient: 'vertical',
                    yAxisIndex: 0,
                    startValue: 0,
                    endValue: Math.min(19, timeData.length - 1),
                    zoomOnMouseWheel: false, // Disable zooming
                    moveOnMouseWheel: true, // Enable panning/scrolling only
                    preventDefaultMouseMove: false,
                },
                {
                    type: 'slider',
                    orient: 'vertical',
                    yAxisIndex: 0,
                    startValue: 0,
                    endValue: Math.min(19, timeData.length - 1),
                    show: true,
                    right: 0,
                    width: 20,
                    handleSize: '100%',
                    textStyle: {
                        fontSize: 10,
                    },
                    zoomLock: true, // Prevent zooming, only allow panning
                },
            ],
            series: [
                {
                    name: 'Events',
                    type: 'scatter', // Back to scatter for timeline points
                    data: timeData.map((item, idx) => [0.05, idx]),
                    symbolSize: (val) => {
                        const idx = val[1];
                        const item = timeData[idx];
                        return item?.isFault ? 30 : item?.isCluster ? 28 : 24;
                    },
                    label: {
                        show: true,
                        position: 'right',
                        formatter: (params) => timeData[params.data[1]].timeAmPm,
                        fontSize: 10,
                        color: '#333',
                        fontWeight: '500',
                    },
                    itemStyle: {
                        color: (params) => {
                            const idx = params.data[1];
                            const item = timeData[idx];
                            return item?.isFault ? '#e53935' : item?.isCluster ? '#fb8c00' : '#43a047';
                        },
                        borderColor: '#fff',
                        borderWidth: 3,
                        shadowColor: 'rgba(0, 0, 0, 0.25)',
                        shadowBlur: 10,
                        shadowOffsetX: 2,
                        shadowOffsetY: 3,
                        opacity: 0.95,
                    },
                    emphasis: {
                        itemStyle: {
                            shadowBlur: 16,
                            shadowColor: 'rgba(242, 159, 103, 0.6)',
                            borderWidth: 4,
                            opacity: 1,
                            shadowOffsetX: 3,
                            shadowOffsetY: 4,
                        },
                    },
                },
            ],
            toolbox: {
                feature: {},
                show: false,
            },
        };
    }, [filteredData, formatTimeDisplay, selectedFlight]);

    // Handle chart click to select event
    const handleChartClick = useCallback((params) => {
        if (params.componentType === 'series' && params.value) {
            const yAxisIndex = params.value[1]; // Changed from xAxisIndex to yAxisIndex
            const sortedData = [...filteredData].sort((a, b) => b.start - a.start); // Sort newest first to match chart
            
            if (yAxisIndex < sortedData.length) {
                const event = sortedData[yAxisIndex];
                setSelectedEvent({
                    ...event,
                    timeAmPm: formatTimeDisplay(event.start),
                    dateTime: moment(event.start).format('YYYY-MM-DD HH:mm:ss'),
                });
                setShowClusterDetails(false); // Reset cluster details when selecting new event
            }
        }
    }, [filteredData, formatTimeDisplay]);

    // Handle module selection
    const handleModuleClick = useCallback((module) => {
        setSelectedModule((prev) =>
            prev.includes(module) ? prev.filter((m) => m !== module) : [...prev, module]
        );
    }, []);

    // Add click listener to chart
    useEffect(() => {
        if (chartRef.current) {
            const echartsInstance = chartRef.current.getEchartsInstance();
            echartsInstance.on('click', handleChartClick);
            return () => {
                echartsInstance.off('click', handleChartClick);
            };
        }
    }, [handleChartClick]);

    // Navigate to intelligent page
    const navigateToIntelligent = () => {
        const queryParams = new URLSearchParams();
        if (selectedFlight) queryParams.set('flight', selectedFlight);
        if (startDate) queryParams.set('startDate', startDate);
        if (startTime) queryParams.set('startTime', startTime);
        if (endDate) queryParams.set('endDate', endDate);
        if (endTime) queryParams.set('endTime', endTime);
        navigate(`/intelligent/${tailNumber}?${queryParams.toString()}`);
    };

    return (
        <div>
            <header role='banner'>
                <nav className='navbar header'>
                    <div className='container'>
                        <div className='navbar-header'>
                            <div className='navbar-brand' onClick={() => navigate('/')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                                <img
                                    src='/assets/14_Honeywell_Logo.png'
                                    className='img-responsive'
                                    style={{ height: '40px' }}
                                    alt=''
                                />
                            </div>
                        </div>
                    </div>
                </nav>
            </header>

            {loading ? (
                <div className='loading-overlay'>
                    <p>Loading timeline data...</p>
                </div>
            ) : (
                <div className='timeline-container'>
                    <div className='filters-container' style={{
                        background: 'linear-gradient(135deg, #1E1E2C 0%, #73706c 100%)',
                        padding: '24px',
                        borderRadius: '12px',
                        marginBottom: '24px',
                        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                            <h2 style={{
                                color: '#fff',
                                fontSize: '28px',
                                fontWeight: '700',
                                margin: 0,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                textShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
                            }}>
                                Flight Logs Timeline
                            </h2>
                            <div className='btn-container' style={{ marginTop: '5px', display: 'flex', justifyContent: 'flex-end', gap: '5px', alignItems: 'center' }}>
                                <button
                                    onClick={() => navigate(`/analytics/${tailNumber}`)}
                                    style={{
                                        padding: '10px 18px',
                                        borderRadius: '8px',
                                        border: '2px solid #fff',
                                        background: 'rgba(255, 255, 255, 0.15)',
                                        color: '#fff',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px'
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'; }}
                                >
                                    Back to Analytics
                                </button>
                                <button
                                    onClick={() => navigate('/')}
                                    style={{
                                        padding: '10px 18px',
                                        borderRadius: '8px',
                                        border: '2px solid #fff',
                                        backgroundColor: 'rgba(255, 255, 255, 0.25)',
                                        color: 'white',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px'
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.25)'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.25)'; }}
                                >
                                    Home
                                </button>
                            </div>
                        </div>
                        <div id='filters' style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                            gap: '16px',
                            padding: '20px',
                            backgroundColor: '#fff',
                            borderRadius: '8px',
                            border: 'none',
                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
                        }}>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <label style={{ fontSize: '12px', fontWeight: '700', color: '#73706c', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    Filter by Flight
                                </label>
                                <select
                                    value={selectedFlight}
                                    onChange={(e) => setSelectedFlight(e.target.value)}
                                    style={{
                                        padding: '10px 12px',
                                        border: '2px solid #73706c',
                                        borderRadius: '6px',
                                        fontSize: '14px',
                                        backgroundColor: '#fff',
                                        cursor: 'pointer',
                                        fontWeight: '500',
                                        transition: 'all 0.3s ease',
                                        color: '#333'
                                    }}
                                >
                                    <option value=''>All Flights</option>
                                    {flights.map((flight) => (
                                        <option key={flight} value={flight}>Flight {flight}</option>
                                    ))}
                                </select>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <label style={{ fontSize: '12px', fontWeight: '700', color: '#73706c', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    Filter by Date
                                </label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                    <select
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                        style={{
                                            padding: '10px 12px',
                                            border: '2px solid #73706c',
                                            borderRadius: '6px',
                                            fontSize: '14px',
                                            backgroundColor: '#fff',
                                            cursor: 'pointer',
                                            fontWeight: '500',
                                            color: '#333'
                                        }}
                                    >
                                        <option value=''>Start Date</option>
                                        {availableDates.map(date => (
                                            <option key={date} value={date}>{date}</option>
                                        ))}
                                    </select>
                                    <select
                                        value={endDate}
                                        onChange={(e) => setEndDate(e.target.value)}
                                        style={{
                                            padding: '10px 12px',
                                            border: '2px solid #73706c',
                                            borderRadius: '6px',
                                            fontSize: '14px',
                                            backgroundColor: '#fff',
                                            cursor: 'pointer',
                                            fontWeight: '500',
                                            color: '#333'
                                        }}
                                    >
                                        <option value=''>End Date</option>
                                        {availableDates.map(date => (
                                            <option key={date} value={date}>{date}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <label style={{ fontSize: '12px', fontWeight: '700', color: '#73706c', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    Filter by Time
                                </label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                    <input
                                        type='time'
                                        value={startTime}
                                        onChange={(e) => setStartTime(e.target.value)}
                                        style={{
                                            padding: '10px 12px',
                                            border: '2px solid #73706c',
                                            borderRadius: '6px',
                                            fontSize: '14px',
                                            backgroundColor: '#fff',
                                            fontWeight: '500',
                                            color: '#333'
                                        }}
                                    />
                                    <input
                                        type='time'
                                        value={endTime}
                                        onChange={(e) => setEndTime(e.target.value)}
                                        style={{
                                            padding: '10px 12px',
                                            border: '2px solid #73706c',
                                            borderRadius: '6px',
                                            fontSize: '14px',
                                            backgroundColor: '#fff',
                                            fontWeight: '500',
                                            color: '#333'
                                        }}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gridColumn: '1 / -1' }}>
                                <label style={{ fontSize: '12px', fontWeight: '700', color: '#73706c', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    Filter by Modules (both event and fault modules)
                                </label>
                                <div className='modules-list' style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(6,minmax(140px, 1fr))',
                                    gap: '10px',
                                    maxHeight: '170px',
                                    overflowY: '',
                                    padding: '12px',
                                    backgroundColor: '#f8f9fa',
                                    border: '2px solid #73706c',
                                    borderRadius: '6px',
                                    boxSizing: 'border-box'
                                }}>
                                    {modules.length === 0 ? (
                                        <p style={{ color: '#6c757d', fontStyle: 'italic', margin: '8px' }}>No modules available</p>
                                    ) : (
                                        modules.map((module) => (
                                            <div
                                                key={module}
                                                onClick={() => handleModuleClick(module)}
                                                className={`module-item ${selectedModule.includes(module) ? 'selected' : ''}`}
                                                style={{
                                                    cursor: 'pointer',
                                                    padding: '10px 12px',
                                                    borderRadius: '15px',
                                                    backgroundColor: selectedModule.includes(module) ? '#769166' : '#e9ecef',
                                                    color: selectedModule.includes(module) ? '#fff' : '#495057',
                                                    fontSize: '13px',
                                                    fontWeight: '600',
                                                    transition: 'all 0.2s ease',
                                                    border: selectedModule.includes(module) ? '2px solid #73706c' : '2px solid transparent',
                                                    boxShadow: selectedModule.includes(module) ? '0 2px 8px rgba(242, 159, 103, 0.3)' : 'none',
                                                    textAlign: 'center',
                                                    whiteSpace: 'normal',
                                                    wordBreak: 'break-word'
                                                }}
                                            >
                                                {module}
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Event Type Filter */}
                            <div style={{ display: 'flex', flexDirection: 'column', gridColumn: '1 / -1' }}>
                                <label style={{ fontSize: '12px', fontWeight: '700', color: '#73706c', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    Filter by Event Type
                                </label>
                                <div style={{
                                    display: 'flex',
                                    gap: '10px',
                                }}>
                                    <div
                                        onClick={() => setEventTypeFilter({ normal: true, faults: false })}
                                        style={{
                                            cursor: 'pointer',
                                            padding: '10px',
                                            borderRadius: '6px',
                                            textAlign: 'center',
                                            backgroundColor: eventTypeFilter.normal ? '#769166' : '#e9ecef',
                                            color: eventTypeFilter.normal ? '#fff' : '#495057',
                                            fontSize: '13px',
                                            fontWeight: '600',
                                            border: '2px solid transparent',
                                            borderColor: eventTypeFilter.normal ? '#73706c' : 'transparent',
                                        }}
                                    >
                                        Normal Events
                                    </div>
                                    <div
                                        onClick={() => setEventTypeFilter({ normal: false, faults: true })}
                                        style={{
                                            cursor: 'pointer',
                                            padding: '10px',
                                            borderRadius: '6px',
                                            textAlign: 'center',
                                            backgroundColor: eventTypeFilter.faults ? '#769166' : '#e9ecef',
                                            color: eventTypeFilter.faults ? '#fff' : '#495057',
                                            fontSize: '13px',
                                            fontWeight: '600',
                                            border: '2px solid transparent',
                                            borderColor: eventTypeFilter.faults ? '#73706c' : 'transparent',
                                        }}
                                    >
                                        Faults
                                    </div>
                                    <div
                                        onClick={() => setEventTypeFilter({ normal: true, faults: true })}
                                        style={{
                                            cursor: 'pointer',
                                            padding: '10px',
                                            borderRadius: '6px',
                                            textAlign: 'center',
                                            backgroundColor: (eventTypeFilter.normal && eventTypeFilter.faults) ? '#769166' : '#e9ecef',
                                            color: (eventTypeFilter.normal && eventTypeFilter.faults) ? '#fff' : '#495057',
                                            fontSize: '13px',
                                            fontWeight: '600',
                                            border: '2px solid transparent',
                                            borderColor: (eventTypeFilter.normal && eventTypeFilter.faults) ? '#73706c' : 'transparent',
                                        }}
                                    >
                                        Both
                                    </div>
                                </div>
                            </div>

                            <div style={{
                                gridColumn: '1 / -1',
                                display: 'flex',
                                justifyContent: 'space-around',
                                gap: '16px',
                                padding: '16px',
                                backgroundColor: 'linear-gradient(135deg, #F29F6715 0%, #34B1AA15 100%)',
                                borderRadius: '8px',
                                border: '2px solid #73706c'
                            }}>
                                <div style={{ textAlign: 'center', flex: 1 }}>
                                    <div style={{ fontSize: '20px', fontWeight: '700', color: '#73706c', marginBottom: '4px' }}>
                                        {filteredData.length}
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#73706c', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' }}>
                                        Total Events
                                    </div>
                                </div>
                                <div style={{ borderRight: '2px solid #73706c' }}></div>
                                <div style={{ textAlign: 'center', flex: 1 }}>
                                    <div style={{ fontSize: '20px', fontWeight: '700', color: '#dc3545', marginBottom: '4px' }}>
                                        {filteredData.filter(e => e.isFault).length}
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#dc3545', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' }}>
                                        Faults
                                    </div>
                                </div>
                                <div style={{ borderRight: '2px solid #73706c' }}></div>
                                <div style={{ textAlign: 'center', flex: 1 }}>
                                    <div style={{ fontSize: '20px', fontWeight: '700', color: '#28a745', marginBottom: '4px' }}>
                                        {filteredData.filter(e => !e.isFault).length}
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#28a745', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' }}>
                                        Normal Events
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {filteredData.length === 0 ? (
                        <div style={{ textAlign: 'center', marginTop: '20px', color: '#73706c', fontSize: '18px', fontWeight: 'bold' }}>
                            No events in the events timeline
                        </div>
                    ) : (
                        <div style={{
                            marginTop: '24px',
                            height: '700px',
                            borderRadius: '12px',
                            overflow: 'hidden',
                            boxShadow: '0 12px 32px rgba(242, 159, 103, 0.2)',
                            border: '2px solid #73706c',
                            background: 'linear-gradient(to bottom, #f8f9fa, #fff)'
                        }}>
                            <ReactECharts
                                ref={chartRef}
                                option={chartOption}
                                style={{ width: '50%', height: '110%' }}
                                opts={{ renderer: 'canvas' }}
                            />
                        </div>
                    )}

                    {selectedEvent && (
                        <div
                            onClick={() => setSelectedEvent(null)}
                            style={{
                                position: 'fixed',
                                right: 0,
                                top: 0,
                                left: 0,
                                bottom: 0,
                                backgroundColor: 'rgba(0,0,0,0.3)',
                                zIndex: 999,
                            }}
                        />
                    )}
                </div>
            )}

            <footer className='footer' style={{ padding: '5px 0', fontSize: '12px', backgroundColor: '#333' }}>
                <div className='footer-left' style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <a href='' style={{ color: 'white', textDecoration: 'none' }}>Terms & Conditions</a>
                    <span style={{ color: 'white', margin: '0 5px' }}> | </span>
                    <a href='' style={{ color: 'white', textDecoration: 'none' }}>Privacy Statement</a>
                </div>
                <div className='footer-right' style={{ textAlign: 'center' }}>
                    <a href='' style={{ color: 'white', textDecoration: 'none' }}></a>
                </div>
            </footer>
        </div>
    );
};

export default TimelinePage;

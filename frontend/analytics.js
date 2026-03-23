import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Chart } from 'primereact/chart'; 
import 'bootstrap/dist/css/bootstrap.min.css';

const AnalyticsPage = () => {
    const { tailNumber } = useParams(); 
    const navigate = useNavigate(); 
    const [analyticsData, setAnalyticsData] = useState([]); 
    const [selectedModule, setSelectedModule] = useState(null); 
    const [selectedPowerOnCounter, setSelectedPowerOnCounter] = useState(''); 
    const [powerOnCounters, setPowerOnCounters] = useState([]); 
    const [allDates, setAllDates] = useState([]); 
    const [availableDates, setAvailableDates] = useState([]); 
    const [availablePowerOnCounters, setAvailablePowerOnCounters] = useState([]); 
    const [startDate, setStartDate] = useState(''); 
    const [endDate, setEndDate] = useState(''); 
    const [chartData, setChartData] = useState(null);
    const [recommendedSteps, setRecommendedSteps] = useState("To be implemented");

    const moduleList = [
        "DTF", "Network Manager", "Policy Handler", "Lan Manager", "Storage Manager",
        "ADG-400 Controller", "ADL", "Aircraft Information", "CA Services",
        "Configuration Manager", "Data Bus Record & Stream", "E2E",
        "Epic Member System", "GUI", "RS Module"
    ];

    useEffect(() => {
        const apiUrl = tailNumber === "All Aircrafts"
            ? `http://localhost:5000/analytics/all`
            : `http://localhost:5000/analytics/${tailNumber}`;
      
        axios.get(apiUrl)
            .then(response => {
                const data = response.data.analytics || [];
                setAnalyticsData(data);

                const uniquePOC = [...new Set(data.map(d => d.power_on_counter))].sort((a, b) => parseInt(a) - parseInt(b));
                setPowerOnCounters(uniquePOC);
                setAvailablePowerOnCounters(uniquePOC);

                const uniqueDates = [...new Set(data.map(d => new Date(d.datetime).toISOString().split('T')[0]))].sort();
                setAllDates(uniqueDates);
                setAvailableDates(uniqueDates);
            })
            .catch(error => console.error("Error fetching analytics data:", error));
    }, [tailNumber]);

    useEffect(() => {
        const filtered = analyticsData.filter(d => {
            const date = d.datetime.split(' ')[0];
            const matchDate = 
                (!startDate || date >= startDate) && 
                (!endDate || date <= endDate);
            const matchPOC = !selectedPowerOnCounter || d.power_on_counter === selectedPowerOnCounter;
            return matchDate && matchPOC;
        });

        const newDates = [...new Set(filtered.map(d => d.datetime.split(' ')[0]))].sort();
        const newPOC = [...new Set(filtered.map(d => d.power_on_counter))].sort((a, b) => parseInt(a) - parseInt(b));
        setAvailableDates(newDates);
        setAvailablePowerOnCounters(newPOC);
    }, [startDate, endDate, selectedPowerOnCounter, analyticsData]);

    useEffect(() => {
        if (!selectedModule) {
            setChartData(null);
            return;
        }

        const filtered = filterData(analyticsData).filter(d => d.module === selectedModule);
        const faultCounts = {};
        filtered.forEach(d => {
            faultCounts[d.L3_text] = (faultCounts[d.L3_text] || 0) + 1;
        });

        const labels = Object.keys(faultCounts);
        const counts = Object.values(faultCounts);

        const palette = [
            'rgba(242, 159, 103, 0.85)', 
            'rgba(59, 143, 243, 0.85)', 
            'rgba(52, 177, 170, 0.85)',  
            'rgba(224, 181, 15, 0.85)',  
            'rgba(75, 192, 192, 0.85)',
            'rgba(153, 102, 255, 0.85)'
        ];

        setChartData({
            labels,
            datasets: [{
                label: `Number Of Faults`,
                data: counts,
                backgroundColor: labels.map((_, i) => palette[i % palette.length]),
                borderColor: '#fff',
                borderWidth: 2,
                hoverOffset: 20
            }]
        });
    }, [selectedModule, startDate, endDate, selectedPowerOnCounter, analyticsData]);

    useEffect(() => {
        setSelectedModule(null);
    }, [startDate, endDate, selectedPowerOnCounter]);

    const filterData = (data) => {
        return data.filter(d => {
            const date = d.datetime.split(' ')[0];
            const matchDate = 
                (!startDate || date >= startDate) && 
                (!endDate || date <= endDate);
            const matchPOC = !selectedPowerOnCounter || d.power_on_counter === selectedPowerOnCounter;
            return matchDate && matchPOC;
        });
    };

    const getFaultModules = () => {
        const filtered = filterData(analyticsData);
        return new Set(filtered.map(d => d.module));
    };

    const getModuleFaultCount = (moduleName) => {
        const filtered = filterData(analyticsData);
        return filtered.filter(d => d.module === moduleName).length;
    };

    const getTotalFaults = () => {
        return filterData(analyticsData).length;
    };

    const handleModuleClick = (moduleName, hasFaults) => {
        if (!hasFaults) return;
        setSelectedModule(moduleName);
    };

    const navigateToTimeline = () => {
        const queryParams = new URLSearchParams();
        if (selectedPowerOnCounter) queryParams.set('power_on_counter', selectedPowerOnCounter);
        if (startDate) queryParams.set('startDate', startDate);
        if (endDate) queryParams.set('endDate', endDate);
        navigate(`/timeline/${tailNumber}?${queryParams.toString()}`);
    };

    const faultyModules = getFaultModules();

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f5f5f5' }}>
            <header role="banner">
                <nav className="navbar header" style={{ background: 'linear-gradient(135deg, #1E1E2C 0%, #73706c 100%)', boxShadow: '0 4px 12px rgba(242, 159, 103, 0.2)' }}>
                    <div className="container">
                        <div className="navbar-header">
                            <a className="navbar-brand" onClick={() => navigate("/")} style={{ cursor: 'pointer' }}>
                                <img src="" className="img-responsive" style={{ height: '40px' }} alt="" />
                            </a>
                        </div>
                    </div>
                </nav>
            </header>

            <main className="page-content" style={{ flex: 1, padding: '32px 24px' }}>
                <div style={{ maxWidth: '1400px', margin: '0 auto', position: 'relative' }}>
                    {/* Page Title */}
                    <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h1 style={{ fontSize: '42px', fontWeight: '1000', color: '#333', margin: '0' }}>
                            Fault Analytics
                        </h1>
                        {/* Navigation Buttons - Top Right */}
                        <div style={{ display: 'flex', gap: '16px' }}>
                            <button onClick={() => navigate("/")} style={{
                                padding: '12px 28px',
                                fontSize: '14px',
                                fontWeight: '600',
                                border: '2px solid #73706c',
                                backgroundColor: '#fff',
                                color: '#73706c',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                transition: 'all 0.3s ease',
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px'
                            }}
                            onMouseEnter={(e) => { e.target.style.backgroundColor = '#73706c'; e.target.style.color = '#fff'; }}
                            onMouseLeave={(e) => { e.target.style.backgroundColor = '#fff'; e.target.style.color = '#73706c'; }}
                            >
                                ← Back to Home
                            </button>
                            <button onClick={navigateToTimeline} style={{
                                padding: '12px 28px',
                                fontSize: '14px',
                                fontWeight: '600',
                                border: '2px solid #73706c',
                                backgroundColor: '#fff',
                                color: '#73706c',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                transition: 'all 0.3s ease',
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                                boxShadow: '0 4px 12px rgba(242, 159, 103, 0.3)'
                            }}
                            onMouseEnter={(e) => { e.target.style.backgroundColor = '#73706c'; e.target.style.color = '#fff'; e.target.style.boxShadow = '0 6px 16px rgba(242, 159, 103, 0.4)'; }}
                            onMouseLeave={(e) => { e.target.style.backgroundColor = '#fff'; e.target.style.color = '#73706c'; e.target.style.boxShadow = '0 4px 12px rgba(242, 159, 103, 0.3)'; }}
                            >
                                → Go to Timeline
                            </button>
                        </div>
                    </div>

                    {/* Grid Layout */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 2fr',
                        columnGap: '16px',
                        rowGap: '32px',
                        alignItems: 'start',
                    }}>
                        <div style={{ gridColumn: '1 / span 1', gridRow: '1 / span 1' }}>
                            {/* Total Faults and Affected Modules */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(2, 1fr)',
                                gap: '16px',
                                marginBottom: '16px',
                            }}>
                                <div style={{
                                    background: '#f1a1a1',
                                    padding: '24px',
                                    borderRadius: '12px',
                                    border: '2px solid #73706c',
                                    boxShadow: '0 4px 12px rgba(242, 159, 103, 0.1)',
                                    textAlign: 'center'
                                }}>
                                    <div style={{ fontSize: '32px', fontWeight: '700', color: '#73706c', marginBottom: '8px' }}>
                                        {getTotalFaults()}
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#000000', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' }}>
                                        Total Faults
                                    </div>
                                </div>
                                <div style={{
                                    background: '#f1a1a1',
                                    padding: '24px',
                                    borderRadius: '12px',
                                    border: '2px solid #73706c',
                                    boxShadow: '0 4px 12px rgba(242, 159, 103, 0.1)',
                                    textAlign: 'center'
                                }}>
                                    <div style={{ fontSize: '32px', fontWeight: '700', color: '#73706c', marginBottom: '8px' }}>
                                        {faultyModules.size}
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#000000', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' }}>
                                        Modules With Faults
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Modules Section */}
                        <div style={{ gridColumn: '1 / span 1', gridRow: '2 / span 2', width: '100%' }}>
                            <div style={{
                                background: '#fff',
                                padding: '28px',
                                borderRadius: '12px',
                                boxShadow: '0 8px 24px rgba(242, 159, 103, 0.1)',
                                border: '2px solid #f0f0f0',
                                width: '100%',
                            }}>
                                <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#000000', margin: '0 0 20px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    Fault Modules
                                </h2>
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(3, 1fr)', // Display three modules per row
                                    gap: '43px'
                                }}>
                                    {moduleList.map(module => {
                                        const hasFaults = faultyModules.has(module);
                                        const faultCount = getModuleFaultCount(module);
                                        const isSelected = selectedModule === module;
                                        return (
                                            <div
                                                key={module}
                                                onClick={() => handleModuleClick(module, hasFaults)}
                                                style={{
                                                    padding: '16px',
                                                    borderRadius: '8px',
                                                    border: `2px solid ${isSelected ? '#73706c' : hasFaults ? '#941a1a' : '#f0f0f0'}`,
                                                    backgroundColor: isSelected ? '#ffffff' : hasFaults ? '#ffffff' : '#f8f8f8',
                                                    cursor: hasFaults ? 'pointer' : 'not-allowed',
                                                    opacity: hasFaults ? 1 : 0.6,
                                                    transition: 'all 0.3s ease',
                                                    boxShadow: isSelected ? '0 4px 12px rgba(242, 159, 103, 0.2)' : hasFaults ? '0 2px 8px rgba(242, 159, 103, 0.1)' : 'none',
                                                    textAlign: 'center'
                                                }}
                                                onMouseEnter={(e) => {
                                                    if (hasFaults) {
                                                        e.currentTarget.style.backgroundColor = '#ffffff';
                                                        e.currentTarget.style.transform = 'translateY(-2px)';
                                                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(242, 159, 103, 0.15)';
                                                    }
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.backgroundColor = isSelected ? '#f0e8e8' : hasFaults ? '#fff' : '#f8f8f8';
                                                    e.currentTarget.style.transform = 'translateY(0)';
                                                    e.currentTarget.style.boxShadow = isSelected ? '0 4px 12px rgba(242, 159, 103, 0.2)' : hasFaults ? '0 2px 8px rgba(242, 159, 103, 0.1)' : 'none';
                                                }}
                                            >
                                                <div style={{ fontSize: '13px', fontWeight: '600', color: '#333', marginBottom: '6px' }}>
                                                    {module}
                                                </div>
                                                <div style={{
                                                    display: 'inline-block',
                                                    backgroundColor: hasFaults ? '#73706c' : '#ccc',
                                                    color: '#fff',
                                                    padding: '4px 8px',
                                                    borderRadius: '12px',
                                                    fontSize: '11px',
                                                    fontWeight: '600'
                                                }}>
                                                    {hasFaults ? `${faultCount} fault${faultCount !== 1 ? 's' : ''}` : 'No faults'}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Chart Section - Fault Analysis */}
                        <div style={{ gridColumn: '2 / span 1', gridRow: '1 / span 2' }}>
                            <div style={{
                                background: '#fff',
                                padding: '28px',
                                borderRadius: '12px',
                                boxShadow: '0 8px 24px rgba(242, 159, 103, 0.1)',
                                border: '2px solid #f0f0f0',
                                height: 'fit-content'
                            }}>
                                {selectedModule ? (
                                    <>
                                        <h2 style={{ fontSize: '20px', fontWeight: '900', color: '#000000', margin: '0 0 20px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                            Fault Analysis - {selectedModule}
                                        </h2>
                                        {chartData && (
                                            <div style={{ height: '450px' }}>
                                                <Chart type="doughnut" data={chartData} options={{
                                                    responsive: true,
                                                    maintainAspectRatio: false,
                                                    cutout: '60%',
                                                    plugins: {
                                                        legend: { display: true, position: 'right', labels: { color: '#666', font: { size: 12, weight: 500 }, padding: 16 } },
                                                        tooltip: {
                                                            enabled: true,
                                                            backgroundColor: 'rgba(100, 60, 33, 0.95)',
                                                            titleColor: '#fff',
                                                            bodyColor: '#fff',
                                                            borderColor: '#fff',
                                                            borderWidth: 1,
                                                            padding: 12,
                                                            displayColors: true,
                                                            boxPadding: 8,
                                                            font: { size: 15, weight: 500 }
                                                        }
                                                    }
                                                }} />
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                                        <div style={{ fontSize: '48px', marginBottom: '16px' }}></div>
                                        <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#333', marginBottom: '8px' }}>
                                            Click on a module on the left pane to view fault distribution
                                        </h3>
                                    
                                        <p style={{ fontSize: '10px', color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                            Modules highlighted in red have faults available for analysis
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* New Box: Solution and Recommended Steps */}
                        <div style={{ gridColumn: '2 / span 1', gridRow: '3 / span 1' }}>
                            <div style={{
                                background: '#fff',
                                padding: '28px',
                                borderRadius: '12px',
                                boxShadow: '0 8px 24px rgba(242, 159, 103, 0.1)',
                                border: '2px solid #f0f0f0',
                                height: '450px',
                                marginBottom: '32px', // Add bottom margin for gap
                            }}>
                                <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#000000', margin: '0 0 20px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    Solution and Recommended Steps
                                </h2>
                                <p style={{ fontSize: '14px', color: '#333', margin: '0' }}>
                                    {recommendedSteps}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            <footer className="footer" style={{ background: 'linear-gradient(135deg, #1E1E2C 0%, #73706c 100%)', marginTop: 'auto' }}>
                <div className="footer-left">
                    <a href="" style={{ color: 'white' }}>Terms & Conditions</a>
                    <span style={{ color: 'white' }}> | </span>
                    <a href="" style={{ color: 'white' }}>Privacy Statement</a>
                </div>
                <div className="footer-right">
                    <a href="" style={{ color: 'white' }}></a>
                </div>
            </footer>
        </div>
    );
};

export default AnalyticsPage;

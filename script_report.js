// Глобальные переменные для хранения данных и состояния загрузки
let isLoading = false;
let startDate = '2025-06-01';
let endDate = '2025-06-07';

// Функция для форматирования даты в формат API (YYYY-MM-DDTHH:mmZ)
function formatDateForAPI(dateStr) {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
        console.error('Invalid date:', dateStr);
        return '';
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}T00:00Z`;
}

// Обработка данных API для графиков
function processApiData(apiData) {
    try {
        // Если данные null или undefined, возвращаем пустые данные
        if (!apiData) {
            return { labels: [], values: [] };
        }

        // Парсинг данных API
        const parsedData = typeof apiData === 'string' ? JSON.parse(apiData) : apiData;
        
        // Если данные не объект, возвращаем пустые данные
        if (typeof parsedData !== 'object' || Array.isArray(parsedData)) {
            console.error('Invalid data format:', parsedData);
            return { labels: [], values: [] };
        }
        
        // Если данные в формате "2025-05-08T00:09: 1"
        if (typeof parsedData === 'object' && Object.keys(parsedData).length === 0 && parsedData.constructor === Object) {
            // Обработка строкового формата
            const dataLines = apiData.split('\n');
            const tempData = {};
            
            dataLines.forEach(line => {
                const [datePart, countPart] = line.split(':');
                if (datePart && countPart) {
                    const date = datePart.trim();
                    const count = parseInt(countPart.trim()) || 0;
                    const dateKey = date.split('T')[0]; // Берем только дату без времени
                    
                    if (dateKey) {
                        tempData[dateKey] = (tempData[dateKey] || 0) + count;
                    }
                }
            });
            
            const sortedDates = Object.keys(tempData).sort();
            
            return {
                labels: sortedDates.map(date => new Date(date).toLocaleDateString('ru-RU', { 
                    day: 'numeric', 
                    month: 'short' 
                })),
                values: sortedDates.map(date => tempData[date])
            };
        }
        
        // Стандартная обработка для формата { "date": count }
        const dailyData = Object.entries(parsedData).reduce((acc, [dateStr, value]) => {
            try {
                const date = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
                if (!isNaN(date.getTime())) {
                    const dateKey = date.toISOString().split('T')[0];
                    acc[dateKey] = (acc[dateKey] || 0) + (parseInt(value) || 0);
                }
            } catch (e) {
                console.error('Error processing data point:', dateStr, value, e);
            }
            return acc;
        }, {});

        const sortedDates = Object.keys(dailyData).sort();
        
        return {
            labels: sortedDates.map(date => new Date(date).toLocaleDateString('ru-RU', { 
                day: 'numeric', 
                month: 'short' 
            })),
            values: sortedDates.map(date => dailyData[date])
        };
    } catch (error) {
        console.error('Error processing API data:', error);
        return { labels: [], values: [] };
    }
}

// Обновление графиков на странице
async function updateCharts() {
    if (isLoading) return;
    
    isLoading = true;
    try {
        const formattedStartDate = formatDateForAPI(startDate);
        const formattedEndDate = formatDateForAPI(endDate);
        
        if (!formattedStartDate || !formattedEndDate) {
            throw new Error('Неверный формат даты');
        }
        
        const dateRangeParam = `fromTo=${formattedStartDate}_${formattedEndDate}`;
       
        // Формируем запросы для каждого графика
        const [timelineResponse, sourcesResponse, sentimentResponse] = await Promise.all([
            fetch(`http://localhost:5000/api/fetch-data?type=chart&query=dates%20all;${dateRangeParam}`),
            fetch(`http://localhost:5000/api/fetch-data?type=chart&query=sites%20all;${dateRangeParam}`),
            fetch(`http://localhost:5000/api/sentiment?query=keywords=" ";minMatch=1;limit=10000;dateFrom=${startDate};dateTo=${endDate}`)
        ]);

        if (!timelineResponse.ok || !sourcesResponse.ok || !sentimentResponse.ok) {
            throw new Error('Ошибка загрузки данных с сервера');
        }

        const timelineText = await timelineResponse.text();
        const sourcesText = await sourcesResponse.text();
        const sentimentText = await sentimentResponse.text();
        
        // Парсим данные вручную с проверкой на пустоту
        const timelineData = timelineText ? JSON.parse(timelineText) : null;
        const sourcesData = sourcesText ? JSON.parse(sourcesText) : null;
        const sentimentData = sentimentText ? JSON.parse(sentimentText) : {
            positive: 0,
            negative: 0,
            normal: 0
        };
        
        console.log('Timeline data:', timelineData);
        console.log('Sources data:', sourcesData);
        console.log('Sentiment data:', sentimentData);
        
        // Обновляем графики
        updateTimelineChart(processApiData(timelineData));
        updateSourcesChart(sourcesData);
        updateSentimentChart(sentimentData);

    } catch (error) {
        console.error('Ошибка при загрузке данных:', error);
        alert('Не удалось загрузить данные: ' + error.message);
    } finally {
        isLoading = false;
    }
}


// Обновление графика временной шкалы (горизонтальная столбчатая диаграмма)

// Обновление графика тональности (горизонтальная столбчатая диаграмма)
function updateSentimentChart(sentimentData) {
    const sentimentCtx = document.getElementById('tones-chart').getContext('2d');
    
    if (typeof Chart === 'undefined') {
        console.error('Chart.js is not loaded');
        return;
    }
    
    // Проверяем и форматируем данные
    const data = {
        positive: sentimentData?.positive || 0,
        negative: sentimentData?.negative || 0,
        normal: sentimentData?.normal || 0
    };
    
    // Подготовка данных для графика
    const labels = ['Позитивные', 'Нейтральные', 'Негативные'];
    const values = [data.positive, data.normal, data.negative];
    const backgroundColors = ['#4CAF50', '#FFC107', '#F44336'];
    
    if (window.sentimentChart) {
        window.sentimentChart.data.labels = formattedLabels;
        window.sentimentChart.data.datasets[0].data = values;
        window.sentimentChart.data.datasets[0].backgroundColor = backgroundColors;
        window.sentimentChart.update();
        return;
    }
    
    // Создаем новый график
    window.sentimentChart = new Chart(sentimentCtx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: backgroundColors,
                borderColor: backgroundColors,
                borderWidth: 1,
                borderRadius: 4,
                barThickness: 'flex',
                maxBarThickness: 40
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.label}: ${context.raw}%`;
                        }
                    }
                },
                datalabels: {
                    display: false
                }
            },
            layout: {
                padding: {
                    left: 0,
                    right: 0,
                    top: 0,
                    bottom: 0
                }
            },   
            scales: {
                x: {
                    display: false,
                    reverse: true,
                    grid: {
                        display: false
                    },
                    max: 100 // Максимальное значение 100% для оси X
                },
                y: {
                    display: true,
                    grid: {
                        display: false
                    },
                    ticks: {
                       color: '#333',
                        font: { size: 16,
                                weight: 'bold'
                        },
                        padding: 2, // Уменьшаем отступы меток
                        mirror: true, // Отражаем метки на другую сторону
                        crossAlign: 'near',
                        z: 1,
                        callback: function(value, index, ticks) {
                            // Возвращаем массив строк для многострочной метки
                            return [`${labels[index]}`, `${values[index]}%`];
                        }
                    },
                }
            },
            barPercentage: 0.8, // Занимать 80% доступного пространства
            categoryPercentage: 0.9 // 90% пространства категории
        }
    });
}


// Обновление графика временной шкалы (горизонтальная столбчатая диаграмма)
function updateTimelineChart(chartData) {
    const timelineCtx = document.getElementById('timeline-chart').getContext('2d');
    
    if (typeof Chart === 'undefined') {
        console.error('Chart.js is not loaded');
        return;
    }
    
    // Форматируем метки для отображения даты и количества
    const formattedLabels = chartData.labels.map((label, i) => {
        return `${label} (${chartData.values[i]})`;
    });
    
    if (window.timelineChart) {
        window.timelineChart.data.labels = formattedLabels;
        window.timelineChart.data.datasets[0].data = chartData.values;
        window.timelineChart.update();
        return;
    }
    
    window.timelineChart = new Chart(timelineCtx, {
        type: 'bar',
        data: {
            labels: formattedLabels,
            datasets: [{
                label: 'Количество публикаций',
                data: chartData.values,
                backgroundColor: '#4285f4',
                borderColor: '#4285f4',
                borderWidth: 1,
                borderRadius: 4,
                barThickness: 'flex',
                maxBarThickness: 20
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    enabled: false // Отключаем всплывающие подсказки
                },
                // Добавляем плагин для отображения значений на полосках
                datalabels: {
                    display: false // Отключаем стандартные datalabels
                }
            },
            scales: {
                x: {
                    display: false, // Скрываем ось X
                    reverse: true,
                    grid: {
                        display: false
                    }
                },
                y: {
                    display: true,
                    grid: {
                        display: false
                    },
                    ticks: {
                       
                        // padding: 10, // Отступ для текста
                        color: '#333', // Цвет текста
                        font: {
                            weight: 'bold',
                            size: 16
                        }
                    }
                }
            }
        }
    });
}

// Обновление графика источников (горизонтальная столбчатая диаграмма)
function updateSourcesChart(sourcesData) {
    const sourcesCtx = document.getElementById('sources-chart').getContext('2d');
    
    if (typeof Chart === 'undefined') {
        console.error('Chart.js is not loaded');
        return;
    }

    // Создаем объект для объединенных данных
    const combinedData = {
        'Telegram': 0,
        'Интернет СМИ': 0
    };

    // Обрабатываем исходные данные
    Object.entries(sourcesData).forEach(([source, count]) => {
        if (source === 'telegram') {
            combinedData['Telegram'] += count;
        } else {
            combinedData['Интернет СМИ'] += count;
        }
    });

    // Преобразуем в массив и сортируем по убыванию
    const sourcesArray = Object.entries(combinedData)
        .sort((a, b) => b[1] - a[1]);
    
    // Вычисляем общее количество публикаций для расчета процентов
    const total = sourcesArray.reduce((sum, [_, count]) => sum + count, 0);
    
    // Форматируем метки для отображения источника и процента
    const formattedLabels = sourcesArray.map(([source, count]) => {
        const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
        return `${source} (${percentage}%)`;
    });

    // Уничтожаем старый график, если он существует
    if (window.sourcesChart) {
        window.sourcesChart.destroy();
    }

    // Создаем новый график
    window.sourcesChart = new Chart(sourcesCtx, {
        type: 'bar',
        data: {
            labels: formattedLabels,
            datasets: [{
                label: 'Количество публикаций',
                data: sourcesArray.map(([_, count]) => count),
                backgroundColor: [
                    '#30d0ff', // Telegram - голубой
                    '#d66e67'  // Интернет СМИ - красный
                ],
                borderWidth: 1,
                borderRadius: 4,
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,

            barThickness: 'flex', // Более толстые столбцы
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    enabled: true,
                    callbacks: {
                        label: function(context) {
                            const percentage = total > 0 
                                ? ((context.raw / total) * 100).toFixed(1) 
                                : 0;
                            return `${context.label.split(' (')[0]}: ${context.raw}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    display: false,
                    reverse: true,
                    grid: { display: false }
                },
                y: {
                    display: true,
                    grid: { display: false },
                    ticks: {
                        padding: 15,
                        color: '#333',
                        font: {
                            size: 16,
                            weight: 'bold'
                        },
                        autoSkip: false,
                        mirror: false,
                        crossAlign: 'far',
                        z: 1
                    }
                }
            },
            layout: {
                padding: {
                    left: 10,
                    right: 10,
                    top: 10,
                    bottom: 10
                }
            }
        }
    });
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    // Убедимся, что Chart.js загружен перед использованием
    if (typeof Chart !== 'undefined') {
        updateCharts();
    } else {
        console.error('Chart.js library is not loaded');
    }
});
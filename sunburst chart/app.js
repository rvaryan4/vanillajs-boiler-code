// Global variables
let data;
let selectedFilters = {
    industry: [],
    function: [],
    technology: []
};
let searchQuery = '';

// Technology colors - soft professional palette
const techColors = {
    'Generative AI': '#C9746D',
    'Machine Learning': '#5B9FA8',
    'Other': '#8B8E98'
};

// D3 variables
const width = window.innerWidth;
const height = window.innerHeight;
const radius = Math.min(width, height) / 2;
const svg = d3.select('#sunburst-svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', [0, 0, width, height]);
const g = svg.append('g')
    .attr('transform', `translate(${width / 2}, ${height / 2})`);

const tooltip = d3.select('#tooltip');

const x = d3.scaleLinear().range([0, 2 * Math.PI]);
const y = d3.scaleSqrt().range([0, radius]);

const arc = d3.arc()
    .startAngle(d => x(d.x0))
    .endAngle(d => x(d.x1))
    .innerRadius(d => y(d.y0))
    .outerRadius(d => y(d.y1))
    .cornerRadius(3)
    .padAngle(0.018);

const color = d3.scaleOrdinal()
    .domain(['Retail', 'Manufacturing', 'Finance', 'Healthcare', 'Logistics', 'Human Resources', 'Legal', 'Energy', 'Generative AI', 'Machine Learning'])
    .range(['#5B8DB4', '#C9956E', '#6FA876', '#B85C75', '#8B7BA8', '#D4A574', '#7B8B9E', '#A0A878', '#C9746D', '#5B9FA8']);
let root;
let currentRoot;
let focus;

// Load data and initialize
fetch('data.json')
    .then(response => response.json())
    .then(json => {
        data = json;
        initializeFilters();
        renderLegend();
        buildSunburst();
        updateCount();
    });

// Initialize filters
function initializeFilters() {
    const industries = [];
    const functions = [];
    const technologies = [];

    // Extract from raw data structure
    if (data && data.children) {
        data.children.forEach(industry => {
            if (industry.name && !industries.includes(industry.name)) {
                industries.push(industry.name);
            }
            if (industry.children) {
                industry.children.forEach(func => {
                    if (func.name && !functions.includes(func.name)) {
                        functions.push(func.name);
                    }
                    if (func.children) {
                        func.children.forEach(useCase => {
                            if (useCase.technology && !technologies.includes(useCase.technology)) {
                                technologies.push(useCase.technology);
                            }
                        });
                    }
                });
            }
        });
    }

    renderFilterOptions('industry-filters', industries, 'industry');
    renderFilterOptions('function-filters', functions, 'function');
    renderFilterOptions('technology-filters', technologies, 'technology');

    // Event listeners
    document.getElementById('search').addEventListener('input', handleSearch);
    document.getElementById('reset-filters').addEventListener('click', resetFilters);
    document.getElementById('dark-mode-toggle').addEventListener('click', toggleDarkMode);

    // Modal close
    document.querySelector('.close').addEventListener('click', () => {
        document.getElementById('details-modal').style.display = 'none';
    });
    window.addEventListener('click', (e) => {
        if (e.target === document.getElementById('details-modal')) {
            document.getElementById('details-modal').style.display = 'none';
        }
    });
}

function renderFilterOptions(containerId, options, type) {
    const container = document.getElementById(containerId);
    options.forEach(option => {
        const tag = document.createElement('div');
        tag.className = 'filter-tag';
        tag.textContent = option;
        tag.addEventListener('click', () => toggleFilter(type, option));
        container.appendChild(tag);
    });
}

function toggleFilter(type, value) {
    if (selectedFilters[type].includes(value)) {
        selectedFilters[type] = selectedFilters[type].filter(item => item !== value);
    } else {
        selectedFilters[type].push(value);
    }
    applyFilters();
}

function handleSearch() {
    searchQuery = document.getElementById('search').value.toLowerCase();
    applyFilters();
}

function applyFilters() {
    // For simplicity, rebuild sunburst with filtered data
    buildSunburst();
    updateCount();
}

function resetFilters() {
    selectedFilters = { industry: [], function: [], technology: [] };
    searchQuery = '';
    document.getElementById('search').value = '';
    document.querySelectorAll('.filter-tag').forEach(tag => tag.classList.remove('selected'));
    applyFilters();
}

function renderLegend() {
    const legendContainer = document.getElementById('legend-items');
    Object.entries(techColors).forEach(([tech, color]) => {
        const item = document.createElement('div');
        item.className = 'legend-item';
        item.innerHTML = `<div class="legend-color" style="background: ${color}"></div>${tech}`;
        legendContainer.appendChild(item);
    });
}

function buildSunburst() {
    // Filter data
    let filteredData = JSON.parse(JSON.stringify(data)); // deep copy

    // Simple filter: if filters selected, prune tree
    if (selectedFilters.industry.length > 0 || selectedFilters.function.length > 0 || selectedFilters.technology.length > 0 || searchQuery) {
        filteredData.children = filteredData.children.filter(industry => {
            if (selectedFilters.industry.length > 0 && !selectedFilters.industry.includes(industry.name)) return false;
            industry.children = industry.children.filter(func => {
                if (selectedFilters.function.length > 0 && !selectedFilters.function.includes(func.name)) return false;
                func.children = func.children.filter(useCase => {
                    if (selectedFilters.technology.length > 0 && !selectedFilters.technology.includes(useCase.technology)) return false;
                    if (searchQuery && !useCase.name.toLowerCase().includes(searchQuery) && !useCase.description.toLowerCase().includes(searchQuery)) return false;
                    return true;
                });
                return func.children.length > 0;
            });
            return industry.children.length > 0;
        });
    }

    root = d3.hierarchy(filteredData)
        .sum(d => d.value || 1)
        .sort((a, b) => b.value - a.value);

    d3.partition().size([2 * Math.PI, radius])(root);

    currentRoot = root;
    focus = root;

    // Set initial scale domains (for zooming)
    x.domain([0, 2 * Math.PI]);
    y.domain([0, radius]);

    renderSunburst();
}

function isArcVisible(d) {
    return d.x1 > focus.x0 && d.x0 < focus.x1 && d.y0 >= focus.y0 && d.y0 < radius;
}

function isLabelVisible(d) {
    return isArcVisible(d) && (x(d.x1) - x(d.x0)) > 0.25;
}

function labelTransform(d) {
    const angle = ((x(d.x0) + x(d.x1)) / 2) * 180 / Math.PI;
    const r = (y(d.y0) + y(d.y1)) / 2;
    return `rotate(${angle - 90}) translate(${r},0) rotate(${angle < 180 ? 0 : 180})`;
}

function showTooltip(event, d) {
    tooltip
        .html(`<strong>${d.data.name}</strong><br/><span>${d.data.technology || ''}</span>`)
        .style('left', `${event.pageX + 14}px`)
        .style('top', `${event.pageY + 14}px`)
        .classed('show', true);
}

function moveTooltip(event) {
    tooltip
        .style('left', `${event.pageX + 14}px`)
        .style('top', `${event.pageY + 14}px`);
}

function hideTooltip() {
    tooltip.classed('show', false);
}

function renderSunburst() {
    const descendants = root.descendants().slice(1);

    // Arcs
    g.selectAll('path')
        .data(descendants, d => d.ancestors().reverse().map(a => a.data.name).join('/'))
        .join(
            enter => enter.append('path')
                .attr('class', 'arc')
                .attr('d', arc)
                .style('fill', d => {
                    if (d.children) {
                        return d3.color(color(d.ancestors().find(a => a.depth === 1)?.data.name || d.data.name)).brighter(0.6);
                    }
                    return color(d.data.technology || d.data.name);
                })
                .style('filter', 'drop-shadow(0 1px 2px rgba(0,0,0,0.08))')
                .style('cursor', d => d.children ? 'pointer' : 'default')
                .style('stroke', '#fff')
                .style('stroke-width', '0.5px')
                .on('click', (event, d) => {
                    if (d.children) {
                        zoomTo(d, { showDetailsAfterZoom: true, showDetailsNode: d, showRootButton: true });
                    } else {
                        showDetails(d, { showRootButton: false });
                    }
                })
                .on('mouseover', (event, d) => showTooltip(event, d))
                .on('mousemove', (event) => moveTooltip(event))
                .on('mouseout', () => hideTooltip())
                .append('title')
                .text(d => d.data.name),
            update => update
                .on('mouseover', (event, d) => showTooltip(event, d))
                .on('mousemove', (event) => moveTooltip(event))
                .on('mouseout', () => hideTooltip()),
            exit => exit.remove()
        )
        .attr('d', arc)
        .style('fill', d => {
            if (d.children) {
                return d3.color(color(d.ancestors().find(a => a.depth === 1)?.data.name || d.data.name)).brighter(0.6);
            }
            return color(d.data.technology || d.data.name);
        })
        .style('fill-opacity', d => isArcVisible(d) ? 1 : 0)
        .style('pointer-events', d => isArcVisible(d) ? 'auto' : 'none');

    // Labels - only show on larger arcs
    g.selectAll('text')
        .data(descendants.filter(isLabelVisible), d => d.ancestors().reverse().map(a => a.data.name).join('/'))
        .join(
            enter => enter.append('text')
                .attr('dy', '0.35em')
                .attr('transform', labelTransform)
                .style('font-size', d => Math.max(10, Math.min((y(d.y1) - y(d.y0)) / 3, 13)) + 'px')
                .style('text-anchor', d => {
                    const angle = ((x(d.x0) + x(d.x1)) / 2) * 180 / Math.PI;
                    return angle < 90 || angle > 270 ? 'start' : 'end';
                })
                .style('font-weight', '500')
                .style('pointer-events', 'none')
                .style('opacity', d => isLabelVisible(d) ? 0.95 : 0)
                .text(d => d.data.name.length > 13 ? d.data.name.substring(0, 13) : d.data.name),
            update => update
                .attr('transform', labelTransform)
                .style('font-size', d => Math.max(10, Math.min((y(d.y1) - y(d.y0)) / 3, 13)) + 'px')
                .style('text-anchor', d => {
                    const angle = ((x(d.x0) + x(d.x1)) / 2) * 180 / Math.PI;
                    return angle < 90 || angle > 270 ? 'start' : 'end';
                })
                .style('opacity', d => isLabelVisible(d) ? 0.95 : 0),
            exit => exit.remove()
        );

    // Center circle for back navigation
    g.selectAll('.center-circle')
        .data(focus.parent ? [focus] : [])
        .join('circle')
        .attr('class', 'center-circle')
        .attr('r', radius / 13)
        .style('filter', 'drop-shadow(0 1px 2px rgba(0,0,0,0.06))')
        .style('cursor', focus.parent ? 'pointer' : 'default')
        .style('opacity', 0)
        .on('click', () => {
            zoomTo(root, { showDetailsAfterZoom: true, showDetailsNode: root, showRootButton: false });
        })
        .transition()
        .duration(300)
        .delay(400)
        .ease(d3.easeCubicInOut)
        .style('opacity', 1);
}

function zoomTo(d, options = {}) {
    focus = d;
    currentRoot = d;

    const xd = d3.interpolate(x.domain(), [d.x0, d.x1]);
    const yd = d3.interpolate(y.domain(), [d.y0, radius]);
    const yr = d3.interpolate(y.range(), [d.y0 ? 20 : 0, radius]);

    const transition = g.transition()
        .duration(800)
        .ease(d3.easeCubicInOut);

    transition.tween('scale', () => t => {
        x.domain(xd(t));
        y.domain(yd(t)).range(yr(t));
    });

    g.selectAll('path')
        .transition(transition)
        .attrTween('d', node => () => arc(node))
        .style('fill-opacity', node => isArcVisible(node) ? 1 : 0)
        .style('pointer-events', node => isArcVisible(node) ? 'auto' : 'none');

    g.selectAll('text')
        .transition(transition)
        .attr('transform', labelTransform)
        .style('opacity', node => isLabelVisible(node) ? 0.95 : 0);

    transition.end().then(() => {
        renderSunburst();
        if (options.showDetailsAfterZoom) {
            showDetails(options.showDetailsNode || d, options);
        }
    }).catch(() => {
        /* ignore interrupted transitions */
    });
}

function showDetails(node, options = {}) {
    const isNode = node && node.data;
    const data = isNode ? node.data : node;

    document.getElementById('modal-title').textContent = data.name;

    // Description
    const descriptionEl = document.getElementById('modal-description');
    if (isNode && node.children) {
        const leafCount = node.leaves().length;
        descriptionEl.textContent = `${node.children.length} sub-category${node.children.length === 1 ? '' : 'ies'} · ${leafCount} use case${leafCount === 1 ? '' : 's'}`;
    } else {
        descriptionEl.textContent = data.description || '';
    }

    // Technology tag
    const techEl = document.getElementById('modal-technology');
    techEl.textContent = data.technology || (isNode && node.depth === 1 ? data.name : 'Category');

    // Business value / leaf count
    const valueEl = document.getElementById('modal-value');
    if (isNode && node.children) {
        const leafCount = node.leaves().length;
        valueEl.textContent = `${leafCount} use case${leafCount === 1 ? '' : 's'}`;
    } else {
        valueEl.textContent = data.business_value || '-';
    }

    // Actions (zoom/drill buttons)
    const actions = document.getElementById('modal-actions');
    actions.innerHTML = '';

    if (isNode) {
        if (node.children && node !== root) {
            const drillBtn = document.createElement('button');
            drillBtn.textContent = 'Drill into this category';
            drillBtn.addEventListener('click', () => {
                document.getElementById('details-modal').style.display = 'none';
                zoomTo(node, { showDetailsAfterZoom: true, showDetailsNode: node, showRootButton: true });
            });
            actions.appendChild(drillBtn);
        }
        if (node.parent) {
            const backBtn = document.createElement('button');
            backBtn.textContent = 'Go one level up';
            backBtn.addEventListener('click', () => {
                document.getElementById('details-modal').style.display = 'none';
                zoomTo(node.parent, { showDetailsAfterZoom: true, showDetailsNode: node.parent, showRootButton: true });
            });
            actions.appendChild(backBtn);
        }
        if (options.showRootButton) {
            const rootBtn = document.createElement('button');
            rootBtn.textContent = 'Go to root';
            rootBtn.addEventListener('click', () => {
                document.getElementById('details-modal').style.display = 'none';
                zoomTo(root, { showDetailsAfterZoom: true, showDetailsNode: root, showRootButton: false });
            });
            actions.appendChild(rootBtn);
        }
    }

    document.getElementById('details-modal').style.display = 'block';
}

function updateCount() {
    const count = root.leaves().length;
    document.getElementById('visible-count').textContent = count;
}

function toggleDarkMode() {
    document.body.classList.toggle('dark');
    const toggle = document.getElementById('dark-mode-toggle');
    toggle.textContent = document.body.classList.contains('dark') ? '☀️' : '🌙';
    renderSunburst(); // re-render for colors
}
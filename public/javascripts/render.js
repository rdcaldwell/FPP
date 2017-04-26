/**
 * Created by ronniecaldwell on 4/7/17.
 */
var graph = {{{dataString}}};

var svg = d3.select("svg"),
    width = +svg.attr("width"),
    height = +svg.attr("height");

var forceStrength = 3;

var simulation = d3.forceSimulation()
    .force("link", d3.forceLink().id(function(d) { return d.id; }).distance(225).strength(1))
    .force('charge', d3.forceManyBody().strength(charge))
    .force("center", d3.forceCenter(width / 2, height / 2));

function charge(d) {
    // 20 = radius
    return -forceStrength * Math.pow(20, 2.0);
}

var link = svg.selectAll(".link")
    .data(graph.links)
    .enter().append("line")
    .attr("class", "link");

var node = svg.append("g")
    .attr("class", "nodes")
    .selectAll(".node")
    .data(graph.nodes)
    .enter().append("g")
    .attr("class", "node")
    .call(d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended));


node.append("text")
    .attr("x", 0)
    .attr("y", -40)
    .attr("dy", ".35em")
    .attr("text-anchor", "middle")
    .text(function(d) { return d.name; });

node.append("image")
    .attr("xlink:href", function(d) {
        return d.picture;
    })
    .attr("x", -20)
    .attr("y", -20)
    .attr("width", 40)
    .attr("height", 40)
    .attr("clip-path", "url(#clip)");

simulation
    .nodes(graph.nodes)
    .on("tick", ticked);

simulation.force("link")
    .links(graph.links);

function ticked() {
    link
        .attr("x1", function(d) { return d.source.x; })
        .attr("y1", function(d) { return d.source.y; })
        .attr("x2", function(d) { return d.target.x; })
        .attr("y2", function(d) { return d.target.y; });

    node
        .attr("transform", function(d) { return "translate(" + d.x + "," + d.y + ")"; })
}

function dragstarted(d) {
    if (!d3.event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
}

function dragged(d) {
    d.fx = d3.event.x;
    d.fy = d3.event.y;
}

function dragended(d) {
    if (!d3.event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
}
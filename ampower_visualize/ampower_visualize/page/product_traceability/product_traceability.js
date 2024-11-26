/**
 * wrapper cannot be passed back and forth from the appended html
 * hence needs to be maintained in the global scope
 * How does this work? Read about variable hoisting: https://developer.mozilla.org/en-US/docs/Glossary/Hoisting
 */
var global_wrapper;

/**
 * initializes a frappe page and wraps its elements inside a default wrapper
 */
frappe.pages['product_traceability'].on_page_load = (wrapper) => {
	global_wrapper = wrapper;
	let page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Product Traceability',
		single_column: true
	});
	setup_fields(page, wrapper);
	append_static_html();
}

let previous_doctype_name = 'Select DocType', previous_document_name = 'Select Document'	// default value gets updated after selection

/**
 * created fields for user input and disables default onchange events
 * @param {Object} page
 * @param {Object} wrapper
 */
const setup_fields = (page, wrapper) => {
	let doctype_field = page.add_field({
		label: 'Select DocType',
		fieldtype: 'Link',
		fieldname: 'document_type',
		options: 'DocType',
		filters: {
			name: ["in", ["Sales Order", "Purchase Order", "Sales Invoice", "Purchase Order", "Purchase Invoice", "Material Request", "Delivery Note"]]
		},
		change() {
			const doctype = doctype_field.get_value();
			if (doctype && doctype !== previous_doctype_name) {
				previous_doctype_name = doctype;
				update_document_field(page, doctype);
			}
		}
	});

	let document_field = page.add_field({
		label: 'Select Document',
		fieldtype: 'Link',
		fieldname: 'document',
		options: previous_doctype_name,
		get_query() {
			return {
				filters: {
					docstatus: 1
				}
			};
		},
		change() {
			const document_name = document_field.get_value();
			if (document_name && document_name !== previous_document_name) {
				previous_document_name = document_name;
				update_visualization(wrapper, previous_doctype_name, document_name);
			}
		}
	});
}

/**
 * Utility function to update the document fields
 */
const update_document_field = (page, doctype) => {
	const document_field = page.fields_dict.document;
	document_field.df.options = doctype;
	document_field.df.label = `Select ${doctype}`;
	document_field.refresh();
	document_field.set_value('');
}

/**
 * Re-populates the wrapper with dynamic HTML elements
 */
const update_visualization = (wrapper, doctype, document_name) => {
	$(wrapper).find('.top-level-parent').remove();
	append_dynamic_html(doctype, document_name);
}

/**
 * Appends static HTML script elements to the document
 * - includes functions for canvas events
 * - constant values that shouldn't be redeclared
 */
const append_static_html = () => {
	$(global_wrapper).find('.layout-main-section').append(`
		<script src="https://d3js.org/d3.v7.min.js"/>
	`);
}

/**
 * Appends dynamic HTML elements and scripts to the document
 * called every time the user changes the document_name or doctype
 * hence needs to be added dynamically
 * @param {String} doctype
 * @param {String} document_name
 */
const append_dynamic_html = (doctype, document_name) => {
	if (!doctype) {
		notify("No doctype specified");
		return;
	}
	if (!document_name) {
		notify("No document name specified");
		return;
	}
	$(global_wrapper).find('.layout-main-section').append(`
		<div class="top-level-parent">
			<script>
				configure_query_url('${doctype}', '${document_name}');
			</script>
		</div>
	`);
}

/**
 * configures corresponding backend functions depending on the doctype
 * @param {String} doctype
 * @param {String} document_name
 */
const configure_query_url = (doctype, document_name) => {
	console.log(document_name, doctype);
	if (!doctype || !document_name) {
		notify("Error parsing fields.", "red");
		return;
	}
	let method_type = 'ampower_visualize.ampower_visualize.page.product_traceability.product_traceability.';
	switch (doctype) {
		case 'Sales Order':
			method_type += 'get_sales_order_links';
			break;
		case 'Material Request':
			method_type += 'get_material_request_links';
			break;
		case 'Purchase Order':
			method_type += 'get_purchase_order_links';
			break;
		default:
			notify("This is the last node.", "red", 5);
			return;
	}
	const node_element = document.querySelector(`.top-level-parent`);
	append_nodes_to_tree(document_name, method_type, node_element);
}

/**
 * Appends child nodes to tree on the canvas.
 * @param {String} document_name 
 * @param {String} method_type 
 * @param {DOM} node_element 
 */
const append_nodes_to_tree = (document_name, method_type, node_element) => {
    frappe.call({
        method: method_type,
        args: { document_name: document_name },
        callback: function (r) {
            if (!r.message.items) {
                notify("Invalid data format or no items to display.", "red");
                return;
            }

            const data = r.message.items;
			console.log(data)
            if (!Array.isArray(data) || data.length === 0) {
                notify("No items to display.", "red");
                return;
            }

            const graph_data = { nodes: [], links: [] };
            data.forEach((item, index) => {
                const parent_node_id = `${item.item_code}-${index}`;
                graph_data.nodes.push({ id: parent_node_id, label: item.item_name, expanded: false });

                const add_links = (connections, type) => {
                    connections.forEach(connection => {
                        graph_data.nodes.push({ 
                            id: `${type}-${connection[type.toLowerCase()]}`,
                            label: connection[type.toLowerCase()] 
                        });
                        graph_data.links.push({ source: parent_node_id, target: `${type}-${connection[type.toLowerCase()]}` });
                    });
                };

                add_links(item.sales_invoices, "sales_invoice");
                add_links(item.delivery_notes, "delivery_note");
                add_links(item.material_requests, "material_request");
                add_links(item.purchase_orders, "purchase_order");
            });

            visualize_graph(graph_data, node_element);
        },
        freeze: true,
        freeze_message: __("Fetching linked documents...")
    });
};

/**
 * UTILITY FUNCTIONS
 */

// Sends frappe alerts
const notify = (message, indicator = "yellow", time = 3) => {	// default time and indicators set
	frappe.show_alert({
		message: __(message),
		indicator: indicator
	}, time);
}

// Checks if all child-objects are empty
const are_all_objects_empty = (obj) => {
	return Object.values(obj).every(
		value => typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0
	);
}

// Adds back-slashes to the document name as query-selector gives error without escape sequence
const modify_escape_sequence = (selector) => {
	return selector.replace(/([!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}

const prepare_graph_data = (data, root_name, root_type) => {
    const nodes = [{ id: root_name, type: root_type }];
    const links = [];
	console.log(data)
    data.forEach(item => {
        Object.keys(item).forEach(key => {
            nodes.push({ id: key, type: item[key][0] });
            links.push({ source: root_name, target: key });
        });
    });
	console.log({"nodes": nodes, "links": links})
    return { nodes, links };
};

const visualize_graph = (graph_data, node_element) => {
    const width = 1256, height = 720;
    d3.select(node_element).select("svg").remove();

    const svg = d3.select(node_element)
        .append("svg")
        .attr("width", width)
        .attr("height", height)
        .call(
            d3.zoom()
                .scaleExtent([0.1, 3])
                .on("zoom", event => {
                    g.attr("transform", event.transform);
                })
        )
        .append("g");

    const g = svg.append("g");

    const simulation = d3.forceSimulation(graph_data.nodes)
        .force("link", d3.forceLink(graph_data.links).id(d => d.id).distance(250))
        .force("charge", d3.forceManyBody().strength(-100))
        .force("center", d3.forceCenter(width / 2, height / 2));

    const link = g.append("g")
        .selectAll("line")
        .data(graph_data.links)
        .enter()
        .append("line")
        .attr("stroke", "#999")
        .attr("stroke-width", 1.5);

    const node = g.append("g")
        .selectAll("circle")
        .data(graph_data.nodes)
        .enter()
        .append("circle")
        .attr("r", 36)
        .attr("fill", "#69b3a2")
        .call(d3.drag()
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended));

			const label = g.append("g")
			.selectAll("text")
			.data(graph_data.nodes)
			.enter()
			.append("text")
			.text(d => d.label)
			.style("font-size", "10px")
			.style("fill", "#fff")
			.attr("text-anchor", "middle")
			.attr("alignment-baseline", "middle");
		
		label
			.attr("x", d => d.x)
			.attr("y", d => d.y);

    simulation.on("tick", () => {
        link
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

        node
            .attr("cx", d => d.x)
            .attr("cy", d => d.y);

        label
            .attr("x", d => d.x + 12)
            .attr("y", d => d.y + 3);
    });

    function dragstarted(event, d) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
    }

    function dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
    }

    function dragended(event, d) {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
    }
};

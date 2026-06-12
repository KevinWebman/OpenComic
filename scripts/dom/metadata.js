/*Filter and sort by metadata (author, genre, etc)*/

// Keys from fileManager metadata (ComicInfo.xml, MetronInfo.xml, pdf and epub), names in language.dialog.fileInfo.data
const fields = [
	'author',
	'publisher',
	'imprint',
	'genre',
	'tags',
	'series',
	'localizedSeries',
	'seriesGroup',
	'alternateSeries',
	'storyArc',
	'ageRating',
	'characters',
	'teams',
	'locations',
	'mainCharacterOrTeam',
	'penciller',
	'inker',
	'colorist',
	'letterer',
	'coverArtist',
	'editor',
	'translator',
	'illustrator',
	'narrator',
	'photographer',
	'contributor',
	'language',
	'format',
	'year',
	'subject',
];

var metadataCache = new Map();
var currentList = [];

function fieldName(key)
{
	return language.dialog.fileInfo.data[key] || key;
}

function setList(files)
{
	currentList = files || [];
	metadataCache.clear();
}

function get(path)
{
	if(metadataCache.has(path))
		return metadataCache.get(path);

	let metadata = false;

	try
	{
		const firstCompressedFile = fileManager.firstCompressedFile(path);
		metadata = fileManager.compressedMetadata(firstCompressedFile);
	}
	catch(error)
	{
		metadata = false;
	}

	metadataCache.set(path, metadata);

	return metadata;
}

// Normalize a metadata value to an array of strings, values can be strings (comma separated), numbers, arrays or objects ({name: ''} or {'#text': ''})
function normalizeValues(value)
{
	if(value === undefined || value === null || value === false || value === '' || value === 0)
		return [];

	if(Array.isArray(value))
	{
		let values = [];

		for(const item of value)
		{
			values = values.concat(normalizeValues(item));
		}

		return values;
	}

	if(typeof value === 'object')
		return normalizeValues(value.name || value['#text'] || '');

	value = String(value).trim();
	if(!value) return [];

	return value.split(/\s*[,;]\s*/).filter(value => value !== '');
}

function fieldValues(path, key)
{
	const metadata = get(path);
	if(!metadata) return [];

	return normalizeValues(metadata[key]);
}

// Unique values (case insensitive) of a field in the current files list
function availableValues(key)
{
	const values = new Map();

	for(const file of currentList)
	{
		for(const value of fieldValues(file.path, key))
		{
			const lower = value.toLowerCase();

			if(!values.has(lower))
				values.set(lower, value);
		}
	}

	return Array.from(values.values()).sort((a, b) => a.localeCompare(b));
}

// Filter

function match(path, filterMetadata = {})
{
	for(let key in filterMetadata)
	{
		const selected = filterMetadata[key];
		if(!selected || !selected.length) continue;

		const selectedLower = selected.map(value => value.toLowerCase());
		const values = fieldValues(path, key);

		const some = values.some(value => selectedLower.includes(value.toLowerCase()));
		if(!some) return false;
	}

	return true;
}

function loadFilter()
{
	const filter = dom.prevIndexLabel()?.filter || {};
	const filterMetadata = filter.metadata || {};

	const filterFields = [];

	for(const key of fields)
	{
		const num = (filterMetadata[key] || []).length;

		if(!num && !availableValues(key).length)
			continue;

		filterFields.push({
			key: key,
			name: fieldName(key),
			num: num,
		});
	}

	handlebarsContext.filterMetadataFields = filterFields;
	handlebarsContext.filterMetadataValues = false;
	handlebarsContext.sortMetadataFields = false;

	document.querySelector('#index-filter-metadata .menu-simple-content').innerHTML = template.load('index.elements.menus.metadata.html');

	events.events();
}

var currentFieldKey = false;
var currentFieldValues = [];

function loadFilterValues(key)
{
	const filter = dom.prevIndexLabel()?.filter || {};
	const selected = (filter.metadata || {})[key] || [];
	const selectedLower = selected.map(value => value.toLowerCase());

	const values = availableValues(key);

	// Keep selected values visible even if they are not in the current list
	for(const value of selected)
	{
		if(!values.some(_value => _value.toLowerCase() === value.toLowerCase()))
			values.push(value);
	}

	values.sort((a, b) => a.localeCompare(b));

	currentFieldKey = key;
	currentFieldValues = values;

	handlebarsContext.filterMetadataFields = false;
	handlebarsContext.filterMetadataName = fieldName(key);
	handlebarsContext.filterMetadataValues = values.map(function(value, index){

		return {
			key: index,
			name: value,
			active: selectedLower.includes(value.toLowerCase()),
		};

	});
	handlebarsContext.sortMetadataFields = false;

	document.querySelector('#index-filter-metadata .menu-simple-content').innerHTML = template.load('index.elements.menus.metadata.html');

	events.events();
}

function filterValues(index)
{
	const value = currentFieldValues[index];
	if(value === undefined) return;

	const currentFilter = dom.prevIndexLabel()?.filter || {};
	const metadata = currentFilter.metadata || {};

	let selected = metadata[currentFieldKey] || [];

	const active = !selected.some(_value => _value.toLowerCase() === value.toLowerCase());

	if(active)
		selected.push(value);
	else
		selected = selected.filter(_value => _value.toLowerCase() !== value.toLowerCase());

	if(selected.length)
		metadata[currentFieldKey] = selected;
	else
		delete metadata[currentFieldKey];

	const hasMetadata = Object.keys(metadata).length ? true : false;

	const menu = dom.query('.menu-metadata-value-'+index).class(active, 's');
	menu.find('i').class(active, 'fill').html(active ? 'check_box' : 'check_box_outline_blank');

	dom.query('.button-filter-metadata').class(hasMetadata, 'fill');

	dom.labels.filter({
		...currentFilter,
		metadata: hasMetadata ? metadata : false,
		hasMetadata: hasMetadata,
	});
}

// Sort

function loadSortMenu()
{
	const page = handlebarsContext.page || {};
	const sort = page.sort || '';

	const sortFields = [];

	for(const key of fields)
	{
		sortFields.push({
			key: key,
			name: fieldName(key),
			active: sort === 'metadata-'+key,
		});
	}

	handlebarsContext.filterMetadataFields = false;
	handlebarsContext.filterMetadataValues = false;
	handlebarsContext.sortMetadataFields = sortFields;
	handlebarsContext.sortMetadataPage = page.name || '';

	document.querySelector('#index-sort-metadata .menu-simple-content').innerHTML = template.load('index.elements.menus.metadata.html');

	events.events();
}

function applySortValues(files, key)
{
	for(const file of files)
	{
		const values = fieldValues(file.path, key);
		file.metadataSortValue = values.length ? values.join(', ').toLowerCase() : '';
	}

	return files;
}

// Files without the metadata field always go to the end, files with the same value are sorted by name
function compare(a, b, sortInvert = false)
{
	const aEmpty = !a.metadataSortValue;
	const bEmpty = !b.metadataSortValue;

	if(aEmpty || bEmpty)
		return (aEmpty === bEmpty) ? dom.orderBy(a, b, 'simple-numeric', 'name') : (aEmpty ? 1 : -1);

	const value = dom.orderBy(a, b, 'simple-numeric', 'metadataSortValue');

	if(value !== 0)
		return sortInvert ? -value : value;

	return dom.orderBy(a, b, 'simple-numeric', 'name');
}

module.exports = {
	fields: fields,
	fieldName: fieldName,
	setList: setList,
	get: get,
	fieldValues: fieldValues,
	availableValues: availableValues,
	match: match,
	loadFilter: loadFilter,
	loadFilterValues: loadFilterValues,
	filterValues: filterValues,
	loadSortMenu: loadSortMenu,
	applySortValues: applySortValues,
	compare: compare,
};
